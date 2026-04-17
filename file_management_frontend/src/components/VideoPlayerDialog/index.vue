<template>
  <el-dialog v-model="visible" :title="title" width="800px" destroy-on-close align-center class="video-player-dialog"
    append-to-body @closed="handleClosed">
    <div v-if="isUnsupportedFormat" class="unsupported-warning">
      <el-alert title="该视频格式 (RMVB/RM) 可能无法在浏览器直接播放" type="warning" description="建议下载后使用本地播放器（如 VLC, IINA）观看。" show-icon
        :closable="false" />
    </div>
    <div class="video-container">
      <video ref="videoRef" :src="videoUrl" controls autoplay class="video-element">
        您的浏览器不支持 video 标签。
      </video>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="downloadVideo">下载并使用本地播放器</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  videoUrl: string
  fileName?: string
}>()

const emit = defineEmits(['update:modelValue', 'download'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const videoRef = ref<HTMLVideoElement | null>(null)

const isUnsupportedFormat = computed(() => {
  const name = (props.fileName || props.title || '').toLowerCase()
  return name.endsWith('.rmvb') || name.endsWith('.rm') || name.endsWith('.avi') || name.endsWith('.wmv') || name.endsWith('.flv') || name.endsWith('.mkv')
})

const handleClosed = () => {
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.src = ''
  }
}

const downloadVideo = () => {
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
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
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

.video-container {
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

.video-element {
  max-width: 100%;
  max-height: 70vh;
  outline: none;
  display: block;
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
