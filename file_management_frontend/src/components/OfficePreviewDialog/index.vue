<template>
    <!-- Office 文档预览弹窗 -->
    <el-dialog
        v-if="modelValue"
        v-model="visible"
        :width="isFullscreen ? '100%' : '80%'"
        :fullscreen="isFullscreen"
        class="office-preview-dialog"
        @close="handleClose"
    >
        <!-- 自定义头部（勿同时传 :title，避免与 #header 插槽冲突） -->
        <template #header="{ titleId }">
            <div class="preview-header">
                <span :id="titleId" class="preview-title">
                    <el-icon class="title-icon">
                        <Document />
                    </el-icon>
                    {{ title }}
                </span>
                <div class="preview-actions">
                    <el-button :icon="Link" circle size="small" :title="t('preview.openInNewTab')" @click="openInNewTab" />
                    <el-button :icon="Download" circle size="small" :title="t('preview.downloadOriginal')" @click="$emit('download')" />
                    <el-button
                        :icon="isFullscreen ? Minus : FullScreen"
                        circle
                        size="small"
                        :title="isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')"
                        @click="toggleFullscreen"
                    />
                </div>
            </div>
        </template>

        <el-alert v-if="statusBarVisible" class="partial-hint" :type="statusBarType" :closable="false" show-icon>
            {{ statusBarText }}
        </el-alert>

        <DocumentPreviewLayout :show-ai-panel="false">
            <template #preview>
                <div class="preview-body" :class="{ 'is-fullscreen': isFullscreen }">
                    <PdfJsViewer
                        v-if="previewUrl && dialogReady"
                        ref="pdfViewerRef"
                        class="preview-pdf"
                        :source-url="previewUrl"
                        :document-key="pdfCacheBust"
                        :restore-page="restorePage"
                        :request-headers="pdfRequestHeaders"
                        @loaded="handlePdfLoaded"
                        @error="handlePdfError"
                        @page-change="lastReadingPage = $event"
                    />

                    <!-- 加载浮层 -->
                    <div v-if="loading" class="preview-loading preview-overlay">
                        <el-icon class="loading-icon is-loading" :size="48">
                            <Loading />
                        </el-icon>
                        <p class="loading-text">{{ loadingText }}</p>
                        <p class="loading-hint">{{ loadingHintText }}</p>
                        <p v-if="isLargeFile" class="loading-hint large-hint">{{ t('preview.largeOfficeHint') }}</p>
                        <el-button v-if="previewUrl" type="primary" text bg class="open-tab-btn" @click="openInNewTab">
                            {{ t('preview.openInNewTab') }}
                        </el-button>
                    </div>

                    <!-- 错误浮层 -->
                    <div v-if="error" class="preview-error preview-overlay">
                        <el-icon :size="64" color="#F56C6C">
                            <WarningFilled />
                        </el-icon>
                        <p class="error-text">{{ t('preview.error') }}</p>
                        <p class="error-detail">{{ error }}</p>
                        <el-button type="primary" @click="retryPreview">{{ t('preview.retry') }}</el-button>
                    </div>
                </div>
            </template>
        </DocumentPreviewLayout>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Download, FullScreen, Link, Loading, Minus, WarningFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import PdfJsViewer from '@components/PdfJsViewer/index.vue'
import DocumentPreviewLayout from '@components/DocumentPreviewLayout/index.vue'

const { t } = useI18n()
const authStore = useAuthStore()

// 组件 Props
const props = withDefaults(
    defineProps<{
        modelValue: boolean
        fileId?: number
        fileName?: string
        /** 字节数；用于大文件时提示，减轻「以为卡死」的误解 */
        fileSizeBytes?: number
    }>(),
    { fileSizeBytes: 0 }
)

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'download'): void
}>()

// 控制弹窗显示
const visible = computed({
    get: () => props.modelValue,
    set: (val: boolean) => emit('update:modelValue', val)
})

// 状态管理
const loading = ref(true)
const error = ref<string | null>(null)
const isFullscreen = ref(false)
const pdfViewerRef = ref<InstanceType<typeof PdfJsViewer> | null>(null)
/** 等 dialog 挂载完成后再挂 PDF 查看器，避免 Teleport 插槽上下文丢失 */
const dialogReady = ref(false)

// 弹窗标题
const title = computed(() => {
    return props.fileName ? `${t('preview.title')} - ${props.fileName}` : t('preview.title')
})

/** 与后端 preview-state 的 firstSlides 一致，每批页数 */
const firstSlideCount = ref(25)
/** 当前快览 PDF 已可用的页数（分批扩展后递增） */
const availableSlides = ref<number | null>(null)
const previewPhase = ref<'none' | 'partial' | 'full' | null>(null)

type PreviewJobState =
    | 'missing'
    | 'waiting'
    | 'active'
    | 'completed'
    | 'failed'
    | 'delayed'
    | 'prioritized'
    | 'unknown'

type PreviewJobInfo = {
    state: PreviewJobState
    attemptsMade?: number
    failedReason?: string
}

const partialJob = ref<PreviewJobInfo | null>(null)
const partialMoreJob = ref<PreviewJobInfo | null>(null)
const fullJob = ref<PreviewJobInfo | null>(null)
const nextBatchTarget = ref<number | null>(null)
/** PDF 查看器当前已加载的页数（用于判断是否有新批次） */
const displayedSlideCount = ref<number | null>(null)
/** 换稿后恢复到该页（1-based） */
const restorePage = ref<number | null>(null)
/** 滚动阅读时持续更新的页码（比 getCurrentPage 更可靠） */
const lastReadingPage = ref(1)
/** 是否已成功加载过至少一次 PDF */
const pdfLoadedOnce = ref(false)

const queueAvailable = ref(true)

const isJobInProgress = (state?: PreviewJobState | null): boolean =>
    state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized'

const statusBarVisible = computed(() => {
    if (previewPhase.value === 'full' || error.value) return false
    if (previewPhase.value === 'partial') return true
    if (
        isJobInProgress(partialJob.value?.state) ||
        isJobInProgress(partialMoreJob.value?.state) ||
        isJobInProgress(fullJob.value?.state)
    ) {
        return true
    }
    if (
        partialJob.value?.state === 'failed' ||
        partialMoreJob.value?.state === 'failed' ||
        fullJob.value?.state === 'failed'
    ) {
        return true
    }
    return false
})

const statusBarType = computed((): 'info' | 'warning' | 'error' => {
    if (partialJob.value?.state === 'failed' || partialMoreJob.value?.state === 'failed') return 'error'
    if (fullJob.value?.state === 'failed' && previewPhase.value === 'partial') return 'warning'
    return 'info'
})

const statusBarText = computed(() => {
    const batch = firstSlideCount.value
    const loaded = availableSlides.value ?? batch
    const partialState = partialJob.value?.state
    const partialMoreState = partialMoreJob.value?.state
    const fullState = fullJob.value?.state
    const phase = previewPhase.value
    const target = nextBatchTarget.value

    if (partialState === 'failed') {
        const reason = partialJob.value?.failedReason || t('preview.jobUnknownError')
        return t('preview.jobPartialFailed', { reason })
    }
    if (partialMoreState === 'failed') {
        const reason = partialMoreJob.value?.failedReason || t('preview.jobUnknownError')
        return t('preview.jobPartialMoreFailed', { reason })
    }

    if (phase === 'partial') {
        if (isJobInProgress(partialMoreState)) {
            return t('preview.partialWithMoreBatchConverting', { loaded, batch: target ?? loaded + batch })
        }
        if (partialMoreState === 'waiting' || partialMoreState === 'delayed' || partialMoreState === 'prioritized') {
            return t('preview.partialWithMoreBatch', { loaded, batch: target ?? loaded + batch })
        }
        if (fullState === 'failed') {
            return t('preview.jobFullFailedPartialOnly', { n: loaded })
        }
        if (isJobInProgress(fullState)) {
            return t('preview.partialWaitingFull', { loaded })
        }
        if (loaded > batch) {
            return t('preview.partialWithMoreBatch', { loaded, batch })
        }
        return t('preview.partialPagesHint', { n: batch })
    }

    if (phase === 'none' || phase === null) {
        if (isJobInProgress(partialState)) {
            if (partialState === 'waiting' || partialState === 'delayed' || partialState === 'prioritized') {
                return t('preview.jobPartialQueued', { n: batch })
            }
            return t('preview.jobPartialConverting', { n: batch })
        }
        if (!queueAvailable.value) {
            return t('preview.queueUnavailable')
        }
    }

    return t('preview.convertingHint')
})

const loadingText = computed(() => {
    const n = firstSlideCount.value
    const partialState = partialJob.value?.state
    if (isJobInProgress(partialState)) {
        if (partialState === 'waiting' || partialState === 'delayed' || partialState === 'prioritized') {
            return t('preview.jobPartialQueued', { n })
        }
        return t('preview.jobPartialConverting', { n })
    }
    return t('preview.converting')
})

const loadingHintText = computed(() => {
    if (!queueAvailable.value) return t('preview.queueUnavailable')
    return t('preview.convertingHint')
})

/** 换稿时 bump，配合 PDF.js 重新拉流 */
const pdfCacheBust = ref(0)

/** 5.5：新标签 / 预览 URL 的缓存破坏 token（与弹窗内 PdfJsViewer 共用） */
const previewCacheToken = computed(() => {
    if (pdfCacheBust.value) return String(pdfCacheBust.value)
    if (previewPhase.value === 'full') return 'full'
    if (
        previewPhase.value === 'partial' &&
        availableSlides.value != null &&
        availableSlides.value > firstSlideCount.value
    ) {
        return `partial-${availableSlides.value}`
    }
    return ''
})

const previewUrl = computed(() => {
    if (!props.fileId) return ''
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = authStore.token || ''
    const cacheToken = previewCacheToken.value
    const bust = cacheToken ? `&_t=${encodeURIComponent(cacheToken)}` : ''
    return `${API_BASE_URL}/api/files/${props.fileId}/preview?token=${encodeURIComponent(token)}${bust}`
})

const pdfRequestHeaders = computed(() => {
    const headers: Record<string, string> = {}
    const token = authStore.token || ''
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
})

const isLargeFile = computed(() => (props.fileSizeBytes ?? 0) > 2 * 1024 * 1024)

let lastPolledPhase: 'none' | 'partial' | 'full' | null = null
let lastPolledAvailableSlides: number | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPreviewStatePoll() {
    if (pollTimer != null) {
        clearInterval(pollTimer)
        pollTimer = null
    }
}

/** 保留当前阅读页并重新加载 PDF（PDF.js 换稿后恢复页码） */
function reloadPdfPreservingPage() {
    const page = pdfViewerRef.value?.getCurrentPage() ?? lastReadingPage.value ?? 1
    restorePage.value = page
    loading.value = true
    error.value = null
    // 等 restorePage 传到子组件后再 bump，避免 loadDocument 读到 null
    void nextTick(() => {
        pdfCacheBust.value = Date.now()
    })
}

/** 首次就绪或失败后自动拉取 PDF */
function reloadPdfFresh() {
    restorePage.value = null
    loading.value = true
    error.value = null
    pdfCacheBust.value = Date.now()
}

function onDocumentVisibility() {
    if (document.visibilityState === 'visible' && props.modelValue) {
        void tickPreviewState()
    }
}

async function tickPreviewState() {
    if (!props.fileId || !props.modelValue) return
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = authStore.token || ''
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    const url = `${API_BASE_URL}/api/files/${props.fileId}/preview-state?token=${encodeURIComponent(token)}`
    try {
        const res = await fetch(url, { headers, credentials: 'include', cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as {
            success?: boolean
            phase?: 'none' | 'partial' | 'full'
            firstSlides?: number
            availableSlides?: number | null
            nextBatchTarget?: number | null
            queueAvailable?: boolean
            jobs?: {
                partial?: PreviewJobInfo
                partialMore?: PreviewJobInfo
                full?: PreviewJobInfo
            }
        }
        if (!data.success || !data.phase) return
        if (typeof data.firstSlides === 'number' && data.firstSlides > 0) {
            firstSlideCount.value = data.firstSlides
        }
        if (typeof data.availableSlides === 'number' && data.availableSlides > 0) {
            availableSlides.value = data.availableSlides
        }
        if (typeof data.nextBatchTarget === 'number') {
            nextBatchTarget.value = data.nextBatchTarget
        } else {
            nextBatchTarget.value = null
        }
        if (typeof data.queueAvailable === 'boolean') {
            queueAvailable.value = data.queueAvailable
        }
        partialJob.value = data.jobs?.partial ?? null
        partialMoreJob.value = data.jobs?.partialMore ?? null
        fullJob.value = data.jobs?.full ?? null

        if (data.jobs?.partial?.state === 'failed' && data.phase === 'none') {
            const reason = data.jobs.partial.failedReason || t('preview.jobUnknownError')
            error.value = t('preview.jobPartialFailed', { reason })
            loading.value = false
            stopPreviewStatePoll()
            return
        }

        const phaseBefore = lastPolledPhase

        if (
            (data.phase === 'partial' || data.phase === 'full') &&
            phaseBefore !== data.phase &&
            (!pdfLoadedOnce.value || error.value)
        ) {
            reloadPdfFresh()
        }

        if (data.phase === 'partial' && typeof data.availableSlides === 'number') {
            if (displayedSlideCount.value === null) {
                displayedSlideCount.value = data.availableSlides
            } else if (data.availableSlides > displayedSlideCount.value && !loading.value) {
                displayedSlideCount.value = data.availableSlides
                reloadPdfPreservingPage()
                ElMessage.success(t('preview.partialBatchLoadedKeepingPage', { n: data.availableSlides }))
            }
        }

        if (data.phase === 'full' && phaseBefore !== 'full' && !loading.value) {
            previewPhase.value = 'full'
            reloadPdfPreservingPage()
            ElMessage.success(t('preview.fullPagesReadyKeepingPage'))
        }

        previewPhase.value = data.phase
        lastPolledPhase = data.phase
        if (typeof data.availableSlides === 'number') {
            lastPolledAvailableSlides = data.availableSlides
        } else if (data.phase === 'full') {
            lastPolledAvailableSlides = null
        }
        if (data.phase === 'full') stopPreviewStatePoll()
    } catch {
        /* 轮询失败不打扰 */
    }
}

function startPreviewStatePoll() {
    stopPreviewStatePoll()
    void tickPreviewState()
    pollTimer = setInterval(() => {
        void tickPreviewState()
    }, 2500)
}

function openInNewTab() {
    const u = previewUrl.value
    if (u) window.open(u, '_blank', 'noopener,noreferrer')
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            dialogReady.value = false
            loading.value = true
            error.value = null
            previewPhase.value = null
            lastPolledPhase = null
            lastPolledAvailableSlides = null
            displayedSlideCount.value = null
            restorePage.value = null
            lastReadingPage.value = 1
            availableSlides.value = null
            pdfLoadedOnce.value = false
            nextBatchTarget.value = null
            partialJob.value = null
            partialMoreJob.value = null
            fullJob.value = null
            queueAvailable.value = true
            pdfCacheBust.value = 0
            document.addEventListener('visibilitychange', onDocumentVisibility)
            startPreviewStatePoll()
            void nextTick(() => {
                dialogReady.value = true
            })
        } else {
            dialogReady.value = false
            document.removeEventListener('visibilitychange', onDocumentVisibility)
            stopPreviewStatePoll()
        }
    }
)

onUnmounted(() => {
    document.removeEventListener('visibilitychange', onDocumentVisibility)
    stopPreviewStatePoll()
})

function handlePdfLoaded(payload: { totalPages: number }) {
    loading.value = false
    error.value = null
    pdfLoadedOnce.value = true
    // restorePage 在 PdfJsViewer 内于加载开始时已快照，此处可安全清除
    restorePage.value = null
    if (previewPhase.value === 'full') {
        displayedSlideCount.value = payload.totalPages
        lastReadingPage.value = Math.min(lastReadingPage.value, payload.totalPages)
    } else if (availableSlides.value) {
        displayedSlideCount.value = availableSlides.value
        lastReadingPage.value = Math.min(lastReadingPage.value, availableSlides.value)
    } else {
        displayedSlideCount.value = payload.totalPages
        lastReadingPage.value = Math.min(lastReadingPage.value, payload.totalPages)
    }
}

function handlePdfError(message: string) {
    loading.value = false
    pdfLoadedOnce.value = false
    error.value = message || t('preview.loadFailed')
}

function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value
}

function retryPreview() {
    loading.value = true
    error.value = null
    pdfLoadedOnce.value = false
    pdfCacheBust.value = Date.now()
}

function handleClose() {
    isFullscreen.value = false
    dialogReady.value = false
    loading.value = true
    error.value = null
    stopPreviewStatePoll()
    previewPhase.value = null
    lastPolledPhase = null
    lastPolledAvailableSlides = null
    displayedSlideCount.value = null
    restorePage.value = null
    lastReadingPage.value = 1
    availableSlides.value = null
    pdfLoadedOnce.value = false
    nextBatchTarget.value = null
    partialJob.value = null
    partialMoreJob.value = null
    fullJob.value = null
    queueAvailable.value = true
    pdfCacheBust.value = 0
}
</script>

<style lang="scss" scoped>
.office-preview-dialog {
    :deep(.el-dialog__body) {
        padding: 0;
        overflow: hidden;
    }
}

.partial-hint {
    margin: 0;
    border-radius: 0;
    flex-shrink: 0;
}

/* 自定义头部 */
.preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}

.preview-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);

    .title-icon {
        color: #409eff;
    }
}

.preview-actions {
    display: flex;
    gap: 8px;
}

/* 预览内容区域 */
.preview-body {
    position: relative;
    height: 70vh;
    background: #525659;

    &.is-fullscreen {
        height: calc(100vh - 60px);
    }
}

.preview-pdf {
    width: 100%;
    height: 100%;
}

/* 浮层 */
.preview-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    background: #f5f5f5;
}

.preview-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;

    .loading-icon {
        color: #409eff;
    }

    .loading-text {
        font-size: 16px;
        color: #303133;
        margin: 0;
    }

    .loading-hint {
        font-size: 13px;
        color: #909399;
        margin: 0;
    }

    .large-hint {
        max-width: 360px;
        text-align: center;
        line-height: 1.5;
    }

    .open-tab-btn {
        margin-top: 4px;
    }
}

.preview-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;

    .error-text {
        font-size: 16px;
        color: #303133;
        margin: 0;
        font-weight: 500;
    }

    .error-detail {
        font-size: 13px;
        color: #909399;
        margin: 0;
        max-width: 400px;
        text-align: center;
        line-height: 1.5;
    }
}

:global(html.dark) {
    .preview-body {
        background: #1a1a1a;
    }

    .preview-loading {
        background: #1a1a1a;

        .loading-text {
            color: #e5eaf3;
        }

        .loading-hint {
            color: #a3a6ad;
        }
    }

    .preview-error {
        background: #1a1a1a;

        .error-text {
            color: #e5eaf3;
        }

        .error-detail {
            color: #a3a6ad;
        }
    }
}
</style>
