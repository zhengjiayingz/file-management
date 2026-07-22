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

    <div class="media-layout" :class="{ 'has-transcript': showTranscriptPanel }">
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

      <aside v-if="showTranscriptPanel" class="transcript-panel">
        <div class="transcript-toolbar">
          <el-button
            size="small"
            type="primary"
            plain
            :loading="indexTriggering"
            :disabled="indexPolling"
            @click="onTriggerIndex"
          >
            {{ indexButtonLabel }}
          </el-button>
          <span class="transcript-status">{{ indexStatusLabel }}</span>
        </div>

        <p v-if="transcriptError" class="transcript-error">{{ transcriptError }}</p>

        <ul v-else class="transcript-list">
          <li
            v-for="(seg, i) in segments"
            :key="i"
            class="transcript-item"
            @click="seekToSegment(seg)"
          >
            <span v-if="seg.startMs != null" class="transcript-time">
              {{ formatMs(seg.startMs) }}
            </span>
            <span class="transcript-text">{{ seg.text }}</span>
          </li>
        </ul>

        <p
          v-if="!transcriptError && segments.length === 0 && indexReady"
          class="transcript-empty"
        >
          暂无转写分句
        </p>
        <p v-else-if="!transcriptError && !indexReady" class="transcript-empty">
          请先建立索引以生成文稿
        </p>
      </aside>
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
  shouldClearProgress,
} from '@utils/mediaPlaybackProgress'
import {
  getDocumentIndexStatus,
  getFileTranscript,
  triggerDocumentIndex,
  type DocumentIndexStatusData,
  type TranscriptSegment,
} from '@api/ai'

const INDEX_POLL_MS = 2500
const INDEX_ACTIVE = [
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'summarizing',
  'extracting_knowledge',
] as const

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
  set: (val) => emit('update:modelValue', val),
})

const dialogWidth = computed(() =>
  mediaKind.value === 'audio' && props.fileId != null ? '860px' : mediaKind.value === 'audio' ? '480px' : '800px',
)

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

const showTranscriptPanel = computed(
  () => mediaKind.value === 'audio' && props.fileId != null,
)

const mediaRef = ref<HTMLMediaElement | null>(null)
const restoreSettled = ref(false)
/** seek 恢复期间不写盘，避免 0 秒覆盖存档 */
let restoringSeek = false
let saveThrottleTimer: ReturnType<typeof setTimeout> | null = null
let restoreFallbackTimer: ReturnType<typeof setTimeout> | null = null

const indexStatus = ref<DocumentIndexStatusData | null>(null)
const indexTriggering = ref(false)
const indexPolling = ref(false)
const segments = ref<TranscriptSegment[]>([])
const transcriptError = ref('')
let indexPollTimer: ReturnType<typeof setInterval> | null = null

const indexReady = computed(() => indexStatus.value?.status === 'ready')

const indexButtonLabel = computed(() =>
  indexReady.value || indexStatus.value?.status === 'failed'
    ? '重新建立索引'
    : '建立索引',
)

const indexStatusLabel = computed(() => {
  const s = indexStatus.value
  if (!s) return '未建立索引'
  if (s.progressMsg) return s.progressMsg
  return s.status
})

const userId = () => authStore.user?.id

function isFiniteDuration(d: number): boolean {
  return Number.isFinite(d) && d > 0
}

function formatMs(ms: number) {
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
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

function stopIndexPoll() {
  if (indexPollTimer) {
    clearInterval(indexPollTimer)
    indexPollTimer = null
  }
  indexPolling.value = false
}

async function loadTranscript() {
  if (props.fileId == null) return
  transcriptError.value = ''
  try {
    const data = await getFileTranscript(props.fileId)
    segments.value = data.segments ?? []
  } catch (e: unknown) {
    segments.value = []
    transcriptError.value =
      (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message || '加载转写失败'
  }
}

async function refreshIndexStatus() {
  if (props.fileId == null) return
  try {
    const data = await getDocumentIndexStatus(props.fileId)
    indexStatus.value = data
    if (data.status === 'ready') {
      stopIndexPoll()
      await loadTranscript()
    } else if (data.status === 'failed') {
      stopIndexPoll()
    } else if (
      INDEX_ACTIVE.includes(data.status as (typeof INDEX_ACTIVE)[number]) &&
      !indexPollTimer
    ) {
      indexPolling.value = true
      indexPollTimer = setInterval(() => {
        void refreshIndexStatus()
      }, INDEX_POLL_MS)
    }
  } catch {
    /* 忽略轮询失败 */
  }
}

async function onTriggerIndex() {
  if (props.fileId == null || indexTriggering.value) return
  indexTriggering.value = true
  transcriptError.value = ''
  const force =
    indexStatus.value?.status === 'ready' ||
    indexStatus.value?.status === 'failed'
  try {
    // 音频先用 novel 体裁占位，与后端 summaryGenre 校验对齐
    const data = await triggerDocumentIndex(props.fileId, 'novel', { force })
    indexStatus.value = data
    if (INDEX_ACTIVE.includes(data.status as (typeof INDEX_ACTIVE)[number])) {
      stopIndexPoll()
      indexPolling.value = true
      indexPollTimer = setInterval(() => {
        void refreshIndexStatus()
      }, INDEX_POLL_MS)
    } else if (data.status === 'ready') {
      await loadTranscript()
    }
  } catch (e: unknown) {
    ElMessage.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message || '建立索引失败',
    )
  } finally {
    indexTriggering.value = false
  }
}

function seekToSegment(seg: TranscriptSegment) {
  const el = mediaRef.value
  if (!el || seg.startMs == null) return
  el.currentTime = seg.startMs / 1000
  void el.play().catch(() => {})
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
        ElMessage.info({
          message: t('mediaPlayer.restoredProgress'),
          duration: 2500,
        })
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
      stopIndexPoll()
    }
  },
)

watch(
  () => [props.modelValue, props.fileId, mediaKind.value] as const,
  async ([open, id, kind]) => {
    if (!open || kind !== 'audio' || id == null) {
      if (!open) {
        segments.value = []
        indexStatus.value = null
        transcriptError.value = ''
      }
      return
    }
    await refreshIndexStatus()
    if (indexStatus.value?.status === 'ready') {
      await loadTranscript()
    }
  },
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
  stopIndexPoll()
  if (mediaRef.value) {
    mediaRef.value.pause()
    mediaRef.value.src = ''
  }
}

onBeforeUnmount(() => {
  persistBeforeClose()
  clearRestoreFallbackTimer()
  stopIndexPoll()
})

const footerPrimaryLabel = computed(() =>
  mediaKind.value === 'audio'
    ? t('fileList.action.download')
    : t('mediaPlayer.downloadWithExternal'),
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

.media-layout.has-transcript {
  display: flex;
  gap: 12px;
  align-items: stretch;
  padding: 12px;
  background: #000;
}

.media-layout.has-transcript .media-container {
  flex: 1;
  min-width: 0;
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

.transcript-panel {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid #333;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  max-height: 360px;
  color: #e5e5e5;
}

.transcript-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.transcript-status {
  font-size: 12px;
  color: #999;
}

.transcript-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
}

.transcript-item {
  padding: 8px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.45;
}

.transcript-item:hover {
  background: #2a2a2a;
}

.transcript-time {
  display: inline-block;
  min-width: 40px;
  margin-right: 6px;
  color: #999;
  font-variant-numeric: tabular-nums;
}

.transcript-error,
.transcript-empty {
  font-size: 12px;
  color: #999;
  margin: 8px 0 0;
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

:deep(.el-button--primary),
:deep(.el-button--primary.is-plain) {
  background-color: #409eff;
  border-color: #409eff;
  color: #fff;
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
