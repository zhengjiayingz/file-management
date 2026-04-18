<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="dialogWidth"
    destroy-on-close
    align-center
    class="video-player-dialog"
    append-to-body
    @closed="handleClosed"
  >
    <div v-if="showVideoUnsupportedHint" class="unsupported-warning">
      <el-alert
        title="该视频格式 (RMVB/RM) 可能无法在浏览器直接播放"
        type="warning"
        description="建议下载后使用本地播放器（如 VLC, IINA）观看。"
        show-icon
        :closable="false"
      />
    </div>
    <div class="media-container" :class="{ 'is-audio': mediaKind === 'audio' }">
      <video
        v-if="mediaKind === 'video'"
        ref="mediaRef"
        :src="videoUrl"
        controls
        autoplay
        class="video-element"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @pause="flushProgress"
        @ended="onEnded"
      >
        您的浏览器不支持 video 标签。
      </video>
      <audio
        v-else
        ref="mediaRef"
        :src="videoUrl"
        controls
        autoplay
        class="audio-element"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @pause="flushProgress"
        @ended="onEnded"
      >
        {{ t('mediaPlayer.audioNotSupported') }}
      </audio>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="emitDownload">{{ footerPrimaryLabel }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@stores/auth'
import {
  loadMediaProgress,
  saveMediaProgress,
  clearMediaProgress,
  shouldClearProgress
} from '@utils/mediaPlaybackProgress'

const props = defineProps<{
  modelValue: boolean
  title: string
  videoUrl: string
  fileName?: string
  /** 用于读写播放进度；未传则不记忆 */
  fileId?: number
  mediaKind?: 'video' | 'audio'
}>()

const emit = defineEmits(['update:modelValue', 'download'])

const { t } = useI18n()
const authStore = useAuthStore()

const mediaKind = computed(() => props.mediaKind ?? 'video')

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const dialogWidth = computed(() => (mediaKind.value === 'audio' ? '480px' : '800px'))

const showVideoUnsupportedHint = computed(() => {
  if (mediaKind.value !== 'video') return false
  const name = (props.fileName || props.title || '').toLowerCase()
  return (
    name.endsWith('.rmvb') ||
    name.endsWith('.rm') ||
    name.endsWith('.avi') ||
    name.endsWith('.wmv') ||
    name.endsWith('.flv') ||
    name.endsWith('.mkv')
  )
})

const mediaRef = ref<HTMLMediaElement | null>(null)
/** 在 loadedmetadata 处理完成前禁止写入，避免 currentTime=0 覆盖已有进度 */
const readyToPersist = ref(false)
let saveThrottleTimer: ReturnType<typeof setTimeout> | null = null

const userId = () => authStore.user?.id
const canPersist = () => !!(userId() && props.fileId != null)

const flushProgress = () => {
  if (!readyToPersist.value) return
  const el = mediaRef.value
  const uid = userId()
  if (!el || !uid || props.fileId == null) return
  const d = el.duration
  if (!d || !Number.isFinite(d)) return
  if (shouldClearProgress(el.currentTime, d)) {
    clearMediaProgress(uid, props.fileId)
    return
  }
  saveMediaProgress(uid, props.fileId, el.currentTime)
}

const scheduleThrottledSave = () => {
  if (saveThrottleTimer != null) return
  saveThrottleTimer = setTimeout(() => {
    saveThrottleTimer = null
    flushProgress()
  }, 2000)
}

const onLoadedMetadata = () => {
  const el = mediaRef.value
  const uid = userId()
  if (!el || !uid || props.fileId == null) {
    readyToPersist.value = true
    return
  }

  const saved = loadMediaProgress(uid, props.fileId)
  const dur = el.duration
  if (!dur || !Number.isFinite(dur)) {
    readyToPersist.value = true
    return
  }

  if (saved != null && saved >= 1) {
    if (saved >= dur - 2) {
      clearMediaProgress(uid, props.fileId)
    } else {
      el.currentTime = Math.min(saved, Math.max(0, dur - 1))
      if (saved >= 3) {
        ElMessage.info({ message: t('mediaPlayer.restoredProgress'), duration: 2500 })
      }
      void el.play().catch(() => {})
    }
  }

  readyToPersist.value = true
}

const onTimeUpdate = () => {
  if (!canPersist()) return
  scheduleThrottledSave()
}

const onEnded = () => {
  const uid = userId()
  if (uid && props.fileId != null) {
    clearMediaProgress(uid, props.fileId)
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      readyToPersist.value = false
    }
  }
)

const handleClosed = () => {
  flushProgress()
  if (saveThrottleTimer != null) {
    clearTimeout(saveThrottleTimer)
    saveThrottleTimer = null
  }
  if (mediaRef.value) {
    mediaRef.value.pause()
    mediaRef.value.src = ''
  }
}

onBeforeUnmount(() => {
  flushProgress()
  if (saveThrottleTimer != null) {
    clearTimeout(saveThrottleTimer)
    saveThrottleTimer = null
  }
})

const footerPrimaryLabel = computed(() =>
  mediaKind.value === 'audio' ? t('fileList.action.download') : t('mediaPlayer.downloadWithExternal')
)

const emitDownload = () => {
  emit('download')
}
</script>

<style scoped>
.unsupported-warning {
  margin-bottom: 16px;
}

.video-player-dialog :deep(.el-dialog) {
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.3),
    0 10px 10px -5px rgba(0, 0, 0, 0.1);
}

.video-player-dialog :deep(.el-dialog__title) {
  color: #fff;
}

.video-player-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #999;
}

.video-player-dialog :deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #fff;
}

.media-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.5);
  min-height: 400px;
}

.media-container.is-audio {
  min-height: 120px;
  padding: 16px 0;
}

.video-element {
  max-width: 100%;
  max-height: 70vh;
  outline: none;
  display: block;
}

.audio-element {
  width: 100%;
  outline: none;
}

.video-player-dialog :deep(.el-dialog__body) {
  padding: 0;
  background: #000;
}

.video-player-dialog :deep(.el-dialog__footer) {
  background: #1a1a1a;
  padding: 15px 20px;
  border-top: 1px solid #333;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.el-button--primary) {
  background-color: #409eff;
  border-color: #409eff;
}

:deep(.el-button--default) {
  background-color: transparent;
  color: #ccc;
  border-color: #444;
}

:deep(.el-button--default:hover) {
  color: #fff;
  border-color: #666;
  background-color: #333;
}
</style>
