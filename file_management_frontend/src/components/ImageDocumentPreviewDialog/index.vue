<template>
  <el-dialog
    v-if="modelValue"
    v-model="visible"
    :width="isFullscreen ? '100%' : 'min(98vw, 1480px)'"
    :fullscreen="isFullscreen"
    class="image-document-preview-dialog"
    destroy-on-close
    top="3vh"
    @close="handleClose"
    @opened="onOpened"
  >
    <template #header="{ titleId }">
      <div class="preview-header">
        <span :id="titleId" class="preview-title">
          <el-icon class="title-icon">
            <Picture />
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

    <DocumentPreviewLayout :show-ai-panel="true">
      <template #preview>
        <div class="preview-with-ocr" :class="{ 'is-fullscreen': isFullscreen }">
          <div
            class="preview-body"
            :title="t('preview.imageDblclickLightbox')"
            @dblclick="openLightbox"
          >
            <el-image
              v-if="previewUrl"
              class="preview-image"
              :src="previewUrl"
              fit="contain"
              @load="handleImageLoad"
              @error="handleImageError"
            />
            <div v-if="loading" class="preview-overlay">
              <el-icon class="is-loading" :size="48">
                <Loading />
              </el-icon>
              <p class="loading-text">{{ t('preview.downloading') }}</p>
            </div>
            <div v-if="error" class="preview-overlay">
              <el-icon :size="64" color="#F56C6C">
                <WarningFilled />
              </el-icon>
              <p class="error-text">{{ t('preview.error') }}</p>
              <p class="error-detail">{{ error }}</p>
              <el-button type="primary" @click="retryPreview">{{ t('preview.retry') }}</el-button>
            </div>
          </div>

          <aside class="ocr-panel">
            <header class="ocr-panel__header">
              <h4 class="ocr-panel__title">{{ t('preview.ocrPanelTitle') }}</h4>
              <p class="ocr-panel__hint">{{ t('preview.ocrPanelHint') }}</p>
            </header>
            <div
              ref="ocrBodyRef"
              class="ocr-panel__body"
              @mouseup="captureOcrSelection"
              @keyup="captureOcrSelection"
            >
              <p v-if="ocrLoading" class="ocr-panel__placeholder">{{ t('preview.ocrPanelLoading') }}</p>
              <p v-else-if="ocrStatus === 'none'" class="ocr-panel__placeholder">
                {{ t('preview.ocrPanelNeedIndex') }}
              </p>
              <p v-else-if="ocrStatus === 'failed'" class="ocr-panel__placeholder">
                {{ t('preview.ocrPanelFailed') }}
              </p>
              <p v-else-if="INDEX_ACTIVE.includes(ocrStatus)" class="ocr-panel__placeholder">
                {{ t('preview.ocrPanelIndexing') }}
              </p>
              <p v-else-if="!ocrText" class="ocr-panel__placeholder">{{ t('preview.ocrPanelEmpty') }}</p>
              <div v-else class="ocr-panel__text">{{ ocrText }}</div>
            </div>
          </aside>
        </div>
      </template>

      <template #ai>
        <DocumentAiPanel
          ref="aiPanelRef"
          :file-id="fileId!"
          :file-name="fileName"
          v-model:selected-text="selectedText"
        />
      </template>
    </DocumentPreviewLayout>

    <CustomImageViewer
      v-model="lightboxVisible"
      :url-list="lightboxUrlList"
      :initial-index="lightboxInitialIndex"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Download, FullScreen, Link, Loading, Minus, Picture, WarningFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import DocumentPreviewLayout from '@components/DocumentPreviewLayout/index.vue'
import DocumentAiPanel from '@components/DocumentAiPanel/index.vue'
import CustomImageViewer from '@components/CustomImageViewer/index.vue'
import {
  getDocumentExtractedText,
  getDocumentIndexStatus,
  type DocumentIndexStatus,
} from '@api/ai'

const INDEX_ACTIVE: DocumentIndexStatus[] = [
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'summarizing',
  'extracting_knowledge',
]

const OCR_POLL_MS = 2000

const { t } = useI18n()
const authStore = useAuthStore()

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    fileId?: number
    fileName?: string
    /** 同目录图片 URL 列表，供双击大图轮播；缺省则仅当前图 */
    galleryUrlList?: string[]
    galleryInitialIndex?: number
  }>(),
  {
    galleryUrlList: () => [],
    galleryInitialIndex: 0,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'download'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

const loading = ref(true)
const error = ref<string | null>(null)
const isFullscreen = ref(false)
const imageCacheBust = ref(0)
const selectedText = ref('')
const aiPanelRef = ref<InstanceType<typeof DocumentAiPanel> | null>(null)
const ocrBodyRef = ref<HTMLElement | null>(null)

const lightboxVisible = ref(false)
const lightboxUrlList = ref<string[]>([])
const lightboxInitialIndex = ref(0)

const ocrText = ref('')
const ocrLoading = ref(false)
const ocrStatus = ref<DocumentIndexStatus>('none')
let ocrPollTimer: ReturnType<typeof setInterval> | null = null

const title = computed(() =>
  props.fileName ? `${t('preview.imageTitle')} - ${props.fileName}` : t('preview.imageTitle'),
)

const previewUrl = computed(() => {
  if (!props.fileId) return ''
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  const bust = imageCacheBust.value ? `&_t=${imageCacheBust.value}` : ''
  return `${API_BASE_URL}/api/files/${props.fileId}/download?token=${encodeURIComponent(token)}&preview=true${bust}`
})

function stopOcrPolling() {
  if (ocrPollTimer) {
    clearInterval(ocrPollTimer)
    ocrPollTimer = null
  }
}

function startOcrPolling() {
  if (ocrPollTimer) return
  ocrPollTimer = setInterval(() => {
    void refreshOcrPanel()
  }, OCR_POLL_MS)
}

async function loadOcrText() {
  if (!props.fileId) return
  ocrLoading.value = true
  try {
    const data = await getDocumentExtractedText(props.fileId)
    ocrText.value = data.text
  } catch {
    ocrText.value = ''
  } finally {
    ocrLoading.value = false
  }
}

async function refreshOcrPanel() {
  if (!props.fileId) return
  try {
    const status = await getDocumentIndexStatus(props.fileId)
    const prev = ocrStatus.value
    ocrStatus.value = status.status

    if (status.status === 'ready') {
      if (prev !== 'ready' || !ocrText.value) {
        await loadOcrText()
      }
      return
    }

    ocrText.value = ''
  } catch {
    /* 保持当前 OCR 面板状态 */
  }
}

function captureOcrSelection() {
  const root = ocrBodyRef.value
  if (!root) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return
  const text = sel.toString().trim()
  if (text) {
    selectedText.value = text
  }
}

function onOpened() {
  aiPanelRef.value?.activate()
  void refreshOcrPanel()
  startOcrPolling()
}

function openLightbox() {
  if (loading.value || error.value || !previewUrl.value) return
  const gallery = props.galleryUrlList.filter(Boolean)
  if (gallery.length > 0) {
    lightboxUrlList.value = gallery
    const idx = props.galleryInitialIndex
    lightboxInitialIndex.value =
      idx >= 0 && idx < gallery.length ? idx : 0
  } else {
    lightboxUrlList.value = [previewUrl.value]
    lightboxInitialIndex.value = 0
  }
  lightboxVisible.value = true
}

function handleImageLoad() {
  loading.value = false
  error.value = null
}

function handleImageError() {
  loading.value = false
  error.value = t('preview.loadFailed')
}

function retryPreview() {
  loading.value = true
  error.value = null
  imageCacheBust.value = Date.now()
}

function openInNewTab() {
  if (previewUrl.value) window.open(previewUrl.value, '_blank', 'noopener,noreferrer')
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function handleClose() {
  selectedText.value = ''
  ocrText.value = ''
  ocrStatus.value = 'none'
  lightboxVisible.value = false
  stopOcrPolling()
  aiPanelRef.value?.reset()
  isFullscreen.value = false
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      loading.value = true
      error.value = null
      selectedText.value = ''
      ocrText.value = ''
      ocrStatus.value = 'none'
      imageCacheBust.value = Date.now()
    } else {
      stopOcrPolling()
      aiPanelRef.value?.reset()
    }
  },
)

onUnmounted(() => {
  stopOcrPolling()
})
</script>

<style lang="scss" scoped>
.image-document-preview-dialog {
  :deep(.el-dialog__body) {
    padding-top: 8px;
  }
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.preview-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.preview-with-ocr {
  display: flex;
  gap: 12px;
  min-height: min(72vh, 640px);
  height: min(72vh, 640px);
  width: 100%;
  align-items: stretch;

  &.is-fullscreen {
    min-height: calc(100vh - 120px);
    height: calc(100vh - 120px);
  }
}

.preview-body {
  position: relative;
  flex: 1.15 1 0;
  min-width: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-in;
}

.preview-image {
  width: 100%;
  height: 100%;

  :deep(img) {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.ocr-panel {
  flex: 0.85 1 0;
  min-width: 200px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  overflow: hidden;
}

.ocr-panel__header {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.ocr-panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ocr-panel__hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.ocr-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.ocr-panel__placeholder {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.ocr-panel__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-primary);
  user-select: text;
  cursor: text;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.92);
  z-index: 10;
  padding: 24px;
  text-align: center;
}

.loading-text,
.error-text {
  margin: 0;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.error-detail {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  max-width: 480px;
  word-break: break-word;
}

@media (max-width: 900px) {
  .preview-with-ocr {
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .preview-body {
    height: min(42vh, 360px);
  }

  .ocr-panel {
    max-width: none;
    min-height: 220px;
  }
}
</style>
