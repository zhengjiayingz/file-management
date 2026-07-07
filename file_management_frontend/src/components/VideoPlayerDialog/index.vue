<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="dialogWidth"
    destroy-on-close
    align-center
    class="video-player-dialog"
    append-to-body
    :before-close="handleBeforeClose"
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
        preload="auto"
        class="video-element"
        @loadedmetadata="tryApplySavedProgress"
        @durationchange="tryApplySavedProgress"
        @canplay="tryApplySavedProgress"
        @playing="onPlaying"
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
        preload="auto"
        class="audio-element"
        @loadedmetadata="tryApplySavedProgress"
        @durationchange="tryApplySavedProgress"
        @canplay="tryApplySavedProgress"
        @playing="onPlaying"
        @timeupdate="onTimeUpdate"
        @pause="flushProgress"
        @ended="onEnded"
      >
        {{ t('mediaPlayer.audioNotSupported') }}
      </audio>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="requestClose">关闭</el-button>
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
const restoreSettled = ref(false)
/** seek 恢复期间不写盘，避免 0 秒覆盖存档 */
let restoringSeek = false
let saveThrottleTimer: ReturnType<typeof setTimeout> | null = null
let restoreFallbackTimer: ReturnType<typeof setTimeout> | null = null

const userId = () => authStore.user?.id

function isFiniteDuration(d: number): boolean {
  return Number.isFinite(d) && d > 0
}

function clearRestoreFallbackTimer() {
  if (restoreFallbackTimer != null) {
    clearTimeout(restoreFallbackTimer)
    restoreFallbackTimer = null
  }
}

function scheduleRestoreFallback() {
  clearRestoreFallbackTimer()
  restoreFallbackTimer = setTimeout(() => {
    restoreFallbackTimer = null
    if (restoreSettled.value) return
    const el = mediaRef.value
    restoreSettled.value = true
    restoringSeek = false
    if (el) void el.play().catch(() => {})
  }, 2500)
}

const flushProgress = () => {
  if (restoringSeek) return
  const el = mediaRef.value
  const uid = userId()
  if (!el || !uid || props.fileId == null) return

  const current = el.currentTime
  if (!Number.isFinite(current) || current < 0.5) return

  const saved = loadMediaProgress(uid, props.fileId)
  if (current < 1 && saved != null && saved >= 1) return

  const d = el.duration
  if (isFiniteDuration(d)) {
    if (shouldClearProgress(current, d)) {
      clearMediaProgress(uid, props.fileId)
      return
    }
  }

  saveMediaProgress(uid, props.fileId, current)
}

const scheduleThrottledSave = () => {
  if (restoringSeek) return
  if (saveThrottleTimer != null) return
  saveThrottleTimer = setTimeout(() => {
    saveThrottleTimer = null
    flushProgress()
  }, 1500)
}

const tryApplySavedProgress = () => {
  if (restoreSettled.value) return

  const el = mediaRef.value
  const uid = userId()
  if (!el) return

  if (!uid || props.fileId == null) {
    restoreSettled.value = true
    restoringSeek = false
    clearRestoreFallbackTimer()
    void el.play().catch(() => {})
    return
  }

  const saved = loadMediaProgress(uid, props.fileId)
  const dur = el.duration

  const finishWithoutSeek = () => {
    restoreSettled.value = true
    restoringSeek = false
    clearRestoreFallbackTimer()
    void el.play().catch(() => {})
  }

  if (saved == null || saved < 1) {
    finishWithoutSeek()
    return
  }

  if (isFiniteDuration(dur) && saved >= dur - 2) {
    clearMediaProgress(uid, props.fileId)
    finishWithoutSeek()
    return
  }

  const target = isFiniteDuration(dur)
    ? Math.min(saved, Math.max(0, dur - 0.5))
    : saved

  const seekAndFinish = () => {
    restoreSettled.value = true
    clearRestoreFallbackTimer()
    restoringSeek = true
    try {
      el.currentTime = target
      if (saved >= 3) {
        ElMessage.info({ message: t('mediaPlayer.restoredProgress'), duration: 2500 })
      }
    } catch {
      // seek 失败则从头播
    }
    restoringSeek = false
    void el.play().catch(() => {})
  }

  if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
    seekAndFinish()
    return
  }

  el.addEventListener('canplay', () => seekAndFinish(), { once: true })
}

const onPlaying = () => {
  flushProgress()
}

const onTimeUpdate = () => {
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
      restoreSettled.value = false
      restoringSeek = false
      scheduleRestoreFallback()
    } else {
      clearRestoreFallbackTimer()
    }
  }
)

const persistBeforeClose = () => {
  if (saveThrottleTimer != null) {
    clearTimeout(saveThrottleTimer)
    saveThrottleTimer = null
  }
  flushProgress()
}

const requestClose = () => {
  persistBeforeClose()
  visible.value = false
}

const handleBeforeClose = (done: () => void) => {
  persistBeforeClose()
  done()
}

const handleClosed = () => {
  if (mediaRef.value) {
    mediaRef.value.pause()
    mediaRef.value.src = ''
  }
}

onBeforeUnmount(() => {
  persistBeforeClose()
  clearRestoreFallbackTimer()
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
