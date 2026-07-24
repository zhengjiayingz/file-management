<template>
  <div class="math-temp-lab">
    <Sidebar />
    <el-container class="main-container">
      <GlobalHeader>
        <template #left>
          <h3>临时截图调试（阶段 B）</h3>
        </template>
      </GlobalHeader>

      <el-main>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="hint"
          title="内部联调页：上传临时图 → 问答/解题 → 存网盘或错题本。正式入口是浏览器插件（阶段 C）。"
        />

        <div class="layout">
          <section class="pane pane--left">
            <h4>1. 上传临时图</h4>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              class="file-input"
              @change="onFilePicked"
            />
            <div class="row">
              <el-button type="primary" :loading="uploading" @click="pickFile">
                选择图片并上传
              </el-button>
              <el-button
                :disabled="!tempImageId || busy"
                @click="discardTemp"
              >
                丢弃临时图
              </el-button>
            </div>

            <div v-if="previewUrl" class="preview-wrap">
              <img :src="previewUrl" alt="preview" class="preview" />
            </div>

            <el-descriptions
              v-if="tempImageId"
              :column="1"
              size="small"
              border
              class="meta"
            >
              <el-descriptions-item label="tempImageId">
                <code>{{ tempImageId }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="expiresAt">
                {{ expiresAt || '—' }}
              </el-descriptions-item>
            </el-descriptions>
            <p v-else class="muted">尚未上传。临时图不会出现在网盘列表。</p>
          </section>

          <section class="pane pane--right">
            <h4>2. 对话</h4>
            <el-radio-group
              v-model="mode"
              :disabled="!tempImageId || streaming"
              class="mode-tabs"
              @change="onModeChange"
            >
              <el-radio-button value="selection">问答</el-radio-button>
              <el-radio-button value="solve">解题</el-radio-button>
            </el-radio-group>

            <div ref="chatListRef" class="chat-list">
              <el-empty
                v-if="messages.length === 0"
                description="暂无消息，发送后可落盘到 temp 会话"
              />
              <div
                v-for="(m, i) in messages"
                :key="i"
                :class="['bubble', m.role === 'user' ? 'bubble--user' : 'bubble--assistant']"
              >
                <div class="bubble__role">{{ m.role === 'user' ? '我' : 'AI' }}</div>
                <pre class="bubble__text">{{ m.content }}</pre>
              </div>
              <div v-if="streaming" class="bubble bubble--assistant">
                <div class="bubble__role">AI</div>
                <pre class="bubble__text">{{ streamBuffer || '…' }}</pre>
              </div>
            </div>

            <div class="composer">
              <el-input
                v-model="draft"
                type="textarea"
                :rows="3"
                :placeholder="mode === 'solve' ? '例如：请给出详细解答' : '例如：这张图在问什么？'"
                :disabled="!tempImageId || streaming"
                @keydown.ctrl.enter="send"
              />
              <div class="composer__actions">
                <el-button
                  type="primary"
                  :loading="streaming"
                  :disabled="!tempImageId || !draft.trim()"
                  @click="send"
                >
                  发送（Ctrl+Enter）
                </el-button>
                <el-button :disabled="!streaming" @click="abortStream">
                  停止
                </el-button>
              </div>
            </div>

            <h4 class="mt">3. 保存</h4>
            <div class="save-row">
              <el-button
                type="success"
                :loading="savingDrive"
                :disabled="!tempImageId || busy"
                @click="saveToDrive"
              >
                保存到网盘（路径①）
              </el-button>
              <el-button
                type="warning"
                :loading="savingWrong"
                :disabled="!tempImageId || busy"
                @click="saveToWrongBook"
              >
                存入错题本（路径②）
              </el-button>
            </div>
            <p class="muted save-hint">
              存网盘只转正图片（可选复制问答到文件会话，不另存 .md）；存错题本用最后一条 AI 回复作为 answerText。
              转正后 temp 会失效，请重新上传再测另一条路径。
            </p>
            <p v-if="lastResult" class="result">
              {{ lastResult }}
              <el-button
                v-if="lastWrongId"
                link
                type="primary"
                @click="router.push(`/wrong-questions/${lastWrongId}`)"
              >
                打开错题
              </el-button>
              <el-button link type="primary" @click="router.push('/')">
                回网盘
              </el-button>
            </p>
          </section>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import Sidebar from '@/views/index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import {
  appendTempAiChatMessage,
  createWrongQuestionFromTemp,
  deleteMathTempImage,
  getTempAiChatSession,
  saveMathTempToDrive,
  streamMathTempAsk,
  streamMathTempSolve,
  uploadMathTempImage,
  type TempAiChatMode,
} from '@api/math-temp'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const router = useRouter()

const fileInputRef = ref<HTMLInputElement | null>(null)
const chatListRef = ref<HTMLElement | null>(null)

const uploading = ref(false)
const streaming = ref(false)
const savingDrive = ref(false)
const savingWrong = ref(false)
const abortCtrl = ref<AbortController | null>(null)

const tempImageId = ref('')
const expiresAt = ref('')
const previewUrl = ref('')
const mode = ref<TempAiChatMode>('selection')
const messages = ref<ChatMsg[]>([])
const draft = ref('')
const streamBuffer = ref('')
const lastResult = ref('')
const lastWrongId = ref<number | null>(null)

const busy = computed(
  () =>
    uploading.value ||
    streaming.value ||
    savingDrive.value ||
    savingWrong.value,
)

function pickFile() {
  fileInputRef.value?.click()
}

async function onFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)

  uploading.value = true
  lastResult.value = ''
  lastWrongId.value = null
  try {
    const res = await uploadMathTempImage(file, file.name)
    tempImageId.value = res.tempImageId
    expiresAt.value = res.expiresAt
    messages.value = []
    streamBuffer.value = ''
    ElMessage.success('临时图已上传')
    await loadSession()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '上传失败')
    tempImageId.value = ''
    expiresAt.value = ''
  } finally {
    uploading.value = false
  }
}

async function loadSession() {
  if (!tempImageId.value) return
  try {
    const data = await getTempAiChatSession(tempImageId.value, mode.value)
    messages.value = data.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    await scrollChat()
  } catch {
    /* 新 temp 无会话也可 */
  }
}

async function onModeChange() {
  await loadSession()
}

async function send() {
  const q = draft.value.trim()
  if (!tempImageId.value || !q || streaming.value) return

  const history = messages.value.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  messages.value.push({ role: 'user', content: q })
  draft.value = ''
  streamBuffer.value = ''
  streaming.value = true
  abortCtrl.value = new AbortController()
  await scrollChat()

  const streamFn =
    mode.value === 'solve' ? streamMathTempSolve : streamMathTempAsk

  try {
    await streamFn({
      tempImageId: tempImageId.value,
      question: q,
      messages: history,
      signal: abortCtrl.value.signal,
      onChunk: (text) => {
        streamBuffer.value += text
        void scrollChat()
      },
    })
    const answer = streamBuffer.value.trim()
    if (answer) {
      messages.value.push({ role: 'assistant', content: answer })
      try {
        await appendTempAiChatMessage(tempImageId.value, mode.value, {
          role: 'user',
          content: q,
        })
        await appendTempAiChatMessage(tempImageId.value, mode.value, {
          role: 'assistant',
          content: answer,
        })
      } catch {
        /* 落盘失败不打断 */
      }
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      ElMessage.info('已停止')
    } else {
      ElMessage.error(e instanceof Error ? e.message : '请求失败')
      // 保留已发出的用户气泡，便于对照错误；不要 pop
    }
  } finally {
    streamBuffer.value = ''
    streaming.value = false
    abortCtrl.value = null
    await scrollChat()
  }
}

function abortStream() {
  abortCtrl.value?.abort()
}

async function saveToDrive() {
  if (!tempImageId.value) return
  savingDrive.value = true
  try {
    const data = await saveMathTempToDrive(tempImageId.value, {
      includeTranscript: false,
      copyChat: true,
    })
    lastResult.value = `已存网盘 userFileId=${data.userFileId}`
    ElMessage.success('已保存到网盘')
    resetAfterPromote()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    savingDrive.value = false
  }
}

async function saveToWrongBook() {
  if (!tempImageId.value) return
  const lastAssistant = [...messages.value]
    .reverse()
    .find((m) => m.role === 'assistant')?.content
  if (!lastAssistant?.trim()) {
    ElMessage.warning('请先完成至少一轮解题/问答，或切换到解题模式发送')
    return
  }
  savingWrong.value = true
  try {
    const res = await createWrongQuestionFromTemp({
      tempImageId: tempImageId.value,
      answerText: lastAssistant,
      difficulty: 'medium',
      tags: ['临时截图调试'],
    })
    lastWrongId.value = res.id
    lastResult.value = `已写入错题本 id=${res.id}`
    ElMessage.success('已存入错题本')
    resetAfterPromote()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '存入失败')
  } finally {
    savingWrong.value = false
  }
}

async function discardTemp() {
  if (!tempImageId.value) return
  try {
    await ElMessageBox.confirm('确定丢弃当前临时图？', '确认', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteMathTempImage(tempImageId.value)
    ElMessage.success('已丢弃')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '丢弃失败')
  }
  resetAfterPromote()
}

function resetAfterPromote() {
  tempImageId.value = ''
  expiresAt.value = ''
  messages.value = []
  streamBuffer.value = ''
  draft.value = ''
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

async function scrollChat() {
  await nextTick()
  const el = chatListRef.value
  if (el) el.scrollTop = el.scrollHeight
}
</script>

<style scoped lang="scss">
.math-temp-lab {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.hint {
  margin-bottom: 16px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 20px;
  min-height: 0;
}

.pane {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;

  h4 {
    margin: 0 0 12px;
    font-size: 15px;
  }
}

.pane--right {
  max-height: calc(100vh - 140px);
}

.file-input {
  display: none;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.preview-wrap {
  margin: 8px 0 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
  background: #f5f7fa;
}

.preview {
  display: block;
  width: 100%;
  max-height: 280px;
  object-fit: contain;
}

.meta {
  margin-top: 8px;
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 8px 0 0;
}

.mode-tabs {
  margin-bottom: 12px;
}

.chat-list {
  flex: 1;
  min-height: 220px;
  max-height: 42vh;
  overflow: auto;
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  margin-bottom: 12px;
}

.bubble {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);

  &--user {
    background: #ecf5ff;
  }

  &__role {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 4px;
  }

  &__text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
  }
}

.composer__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.mt {
  margin-top: 16px !important;
}

.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.save-hint {
  margin-top: 8px;
}

.result {
  margin-top: 12px;
  font-size: 14px;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .pane--right {
    max-height: none;
  }
}
</style>
