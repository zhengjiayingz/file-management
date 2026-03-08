<template>
    <!-- Office 文档预览弹窗 -->
    <el-dialog v-model="visible" :title="title" :width="isFullscreen ? '100%' : '80%'" :fullscreen="isFullscreen"
        destroy-on-close class="office-preview-dialog" @close="handleClose">
        <!-- 自定义头部 -->
        <template #header="{ titleId }">
            <div class="preview-header">
                <span :id="titleId" class="preview-title">
                    <el-icon class="title-icon">
                        <Document />
                    </el-icon>
                    {{ title }}
                </span>
                <div class="preview-actions">
                    <!-- 下载原文件按钮 -->
                    <el-tooltip :content="t('preview.downloadOriginal')" placement="bottom">
                        <el-button :icon="Download" circle size="small" @click="$emit('download')" />
                    </el-tooltip>
                    <!-- 全屏切换按钮 -->
                    <el-tooltip :content="isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')"
                        placement="bottom">
                        <el-button :icon="isFullscreen ? Minus : FullScreen" circle size="small"
                            @click="toggleFullscreen" />
                    </el-tooltip>
                </div>
            </div>
        </template>

        <!-- 预览内容区域 -->
        <div class="preview-body" :class="{ 'is-fullscreen': isFullscreen }">
            <!-- PDF 预览 iframe（始终渲染，加载/错误时被浮层覆盖） -->
            <iframe ref="iframeRef" :src="previewUrl" class="preview-iframe" @load="handleIframeLoad"
                @error="handleIframeError" />

            <!-- 加载浮层（覆盖在 iframe 上方） -->
            <div v-if="loading" class="preview-loading preview-overlay">
                <el-icon class="loading-icon is-loading" :size="48">
                    <Loading />
                </el-icon>
                <p class="loading-text">{{ t('preview.converting') }}</p>
                <p class="loading-hint">{{ t('preview.convertingHint') }}</p>
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
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Document, Download, FullScreen, Loading, Minus, WarningFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()

// 组件 Props
const props = defineProps<{
    modelValue: boolean     // 弹窗是否可见
    fileId?: number         // 文件 ID
    fileName?: string       // 文件名称（用于标题显示）
}>()

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
const iframeRef = ref<HTMLIFrameElement>()

// 弹窗标题
const title = computed(() => {
    return props.fileName ? `${t('preview.title')} - ${props.fileName}` : t('preview.title')
})

// 预览 URL：调用后端 preview 接口
const previewUrl = computed(() => {
    if (!props.fileId) return ''
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = authStore.token || ''
    return `${API_BASE_URL}/api/files/${props.fileId}/preview?token=${token}`
})

// 监听弹窗打开，重置状态
watch(() => props.modelValue, (newVal) => {
    if (newVal) {
        loading.value = true
        error.value = null
    }
})

/**
 * iframe 加载成功
 */
const handleIframeLoad = () => {
    loading.value = false
}

/**
 * iframe 加载失败
 */
const handleIframeError = () => {
    loading.value = false
    error.value = t('preview.loadFailed')
}

/**
 * 切换全屏
 */
const toggleFullscreen = () => {
    isFullscreen.value = !isFullscreen.value
}

/**
 * 重试预览
 */
const retryPreview = () => {
    loading.value = true
    error.value = null
    // 通过强制刷新 iframe src 来重试
    if (iframeRef.value) {
        iframeRef.value.src = previewUrl.value
    }
}

/**
 * 关闭弹窗时重置状态
 */
const handleClose = () => {
    isFullscreen.value = false
    loading.value = true
    error.value = null
}
</script>

<style lang="scss" scoped>
.office-preview-dialog {
    :deep(.el-dialog__body) {
        padding: 0;
        overflow: hidden;
    }
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
    background: #f5f5f5;

    &.is-fullscreen {
        height: calc(100vh - 60px);
    }
}

/* 浮层（覆盖在 iframe 上方） */
.preview-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    background: #f5f5f5;
}

/* 加载状态 */
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
}

/* 错误状态 */
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

/* PDF 预览 iframe */
.preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
}

/* 深色模式适配 */
:global(html.dark) {
    .preview-body {
        background: #1a1a1a;
    }

    .preview-loading {
        .loading-text {
            color: #e5eaf3;
        }

        .loading-hint {
            color: #a3a6ad;
        }
    }

    .preview-error {
        .error-text {
            color: #e5eaf3;
        }

        .error-detail {
            color: #a3a6ad;
        }
    }
}
</style>
