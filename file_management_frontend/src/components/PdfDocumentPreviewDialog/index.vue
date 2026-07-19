<template>
  <el-dialog
    v-if="modelValue"
    v-model="visible"
    :width="isFullscreen ? '100%' : 'min(96vw, 1280px)'"
    :fullscreen="isFullscreen"
    class="pdf-document-preview-dialog"
    destroy-on-close
    top="3vh"
    @close="handleClose"
    @opened="onOpened"
  >
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

    <DocumentPreviewLayout :show-ai-panel="true" :fullscreen="isFullscreen">
      <template #preview>
        <div class="preview-body">
          <PdfJsViewer
            v-if="previewUrl && dialogReady"
            ref="pdfViewerRef"
            class="preview-pdf"
            :source-url="previewUrl"
            :document-key="pdfCacheBust"
            :request-headers="pdfRequestHeaders"
            @loaded="handlePdfLoaded"
            @error="handlePdfError"
            @selection-change="selectedText = $event"
          />

          <div v-if="loading" class="preview-loading preview-overlay">
            <el-icon class="loading-icon is-loading" :size="48">
              <Loading />
            </el-icon>
            <p class="loading-text">{{ t('preview.downloading') }}</p>
            <el-button v-if="previewUrl" type="primary" text bg class="open-tab-btn" @click="openInNewTab">
              {{ t('preview.openInNewTab') }}
            </el-button>
          </div>

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

      <template #ai>
        <DocumentAiPanel
          ref="aiPanelRef"
          :file-id="fileId!"
          :file-name="fileName"
          v-model:selected-text="selectedText"
        />
      </template>
    </DocumentPreviewLayout>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Document, Download, FullScreen, Link, Loading, Minus, WarningFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import PdfJsViewer from '@components/PdfJsViewer/index.vue'
import DocumentPreviewLayout from '@components/DocumentPreviewLayout/index.vue'
import DocumentAiPanel from '@components/DocumentAiPanel/index.vue'

const { t } = useI18n()
const authStore = useAuthStore()

const props = defineProps<{
  modelValue: boolean
  fileId?: number
  fileName?: string
}>()

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
const dialogReady = ref(false)
const pdfCacheBust = ref(0)
const selectedText = ref('')
const pdfViewerRef = ref<InstanceType<typeof PdfJsViewer> | null>(null)
const aiPanelRef = ref<InstanceType<typeof DocumentAiPanel> | null>(null)

const title = computed(() =>
  props.fileName ? `${t('preview.pdfTitle')} - ${props.fileName}` : t('preview.pdfTitle'),
)

const previewUrl = computed(() => {
  if (!props.fileId) return ''
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  const bust = pdfCacheBust.value ? `&_t=${pdfCacheBust.value}` : ''
  return `${API_BASE_URL}/api/files/${props.fileId}/download?token=${encodeURIComponent(token)}&preview=true${bust}`
})

const pdfRequestHeaders = computed(() => {
  const headers: Record<string, string> = {}
  const token = authStore.token || ''
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
})

function onOpened() {
  aiPanelRef.value?.activate()
}

function handlePdfLoaded() {
  loading.value = false
  error.value = null
}

function handlePdfError(message: string) {
  loading.value = false
  error.value = message || t('preview.loadFailed')
}

function retryPreview() {
  loading.value = true
  error.value = null
  pdfCacheBust.value = Date.now()
}

function openInNewTab() {
  const u = previewUrl.value
  if (u) window.open(u, '_blank', 'noopener,noreferrer')
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function handleClose() {
  selectedText.value = ''
  aiPanelRef.value?.reset()
  isFullscreen.value = false
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      dialogReady.value = false
      loading.value = true
      error.value = null
      selectedText.value = ''
      pdfCacheBust.value = Date.now()
      void nextTick(() => {
        dialogReady.value = true
      })
    } else {
      dialogReady.value = false
      aiPanelRef.value?.reset()
    }
  },
)
</script>

<style lang="scss" scoped>
.pdf-document-preview-dialog {
  :deep(.el-dialog__body) {
    padding-top: 8px;
    overflow: hidden;
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

.title-icon {
  flex-shrink: 0;
}

.preview-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.preview-body {
  position: relative;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #525659;
}

.preview-pdf {
  width: 100%;
  height: 100%;
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

.open-tab-btn {
  margin-top: 8px;
}
</style>
