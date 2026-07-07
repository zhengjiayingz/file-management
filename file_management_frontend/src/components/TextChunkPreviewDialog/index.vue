<template>
  <el-dialog v-model="visible" :title="dialogTitle" class="text-chunk-preview-dialog" width="min(96vw, 1280px)"
    top="3vh" destroy-on-close @open="onOpen" @opened="onDialogOpened" @closed="reset">
    <div class="preview-split">
      <section class="preview-split__left">
        <p class="hint-line">{{ t('preview.textChunkBytesHint') }}</p>
        <p v-if="totalSize > 0" class="meta-line">
          {{
            t('preview.textChunkProgress', {
              loaded: nextOffset,
              total: totalSize
            })
          }}
        </p>
        <div class="text-chunk-options">
          <el-checkbox v-model="reflowForReading" :disabled="initialLoading">
            {{ t('preview.textChunkReflow') }}
          </el-checkbox>
        </div>
        <div ref="scrollRef" v-loading="initialLoading" class="text-chunk-scroll" @scroll.passive="onScroll"
          @mouseup="captureSelection">
          <div v-if="!initialLoading" class="vlist-inner" :style="{
            height: `${vTotalSize}px`,
            position: 'relative',
            width: '100%'
          }">
            <div v-for="v in virtualItems" :key="String(v.key)" :data-index="v.index" :ref="onRowRef" class="vlist-row"
              :class="{
                'vlist-row--para-indent': !!displayRows[v.index]?.indentFirstLine,
                'vlist-row--blank': !!displayRows[v.index]?.isBlank
              }" :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                width: 'auto',
                transform: `translateY(${v.start}px)`
              }">
              {{ displayRows[v.index]?.text ?? '' }}
            </div>
          </div>
          <div v-if="appending && !initialLoading" class="vlist-appending">…</div>
        </div>
        <div v-if="loadError" class="err-line">{{ loadError }}</div>
        <p v-else-if="done && !initialLoading" class="end-line">{{ t('preview.textChunkEnd') }}</p>
        <div class="footer-actions">
          <el-button v-if="!done && !loadingMore && !initialLoading" type="primary" plain @click="loadNext">
            {{ t('preview.textChunkLoadMore') }}
          </el-button>
        </div>
      </section>

      <section class="preview-split__right">
        <div class="ai-chat-panel">
          <header class="ai-chat-header">
            <div>
              <h4 class="ai-chat-title">{{ t('preview.aiAskTitle') }}</h4>
              <p class="ai-chat-hint">{{ t('preview.aiAskHint') }}</p>
            </div>
            <el-button v-if="chatMessages.length > 0" size="small" text type="danger" @click="clearChat">
              {{ t('preview.aiChatClear') }}
            </el-button>
          </header>

          <div class="ai-chat-context">
            <span class="ai-chat-context-label">{{ t('preview.aiChatContext') }}</span>
            <p v-if="selectedText" class="ai-chat-context-text">{{ selectedPreview }}</p>
            <p v-else class="ai-chat-context-empty">{{ t('preview.aiAskSelectedEmpty') }}</p>
          </div>

          <div ref="chatScrollRef" class="ai-chat-messages">
            <p v-if="chatMessages.length === 0" class="ai-chat-empty">{{ t('preview.aiChatEmpty') }}</p>
            <div v-for="msg in chatMessages" :key="msg.id" class="ai-chat-bubble"
              :class="msg.role === 'user' ? 'ai-chat-bubble--user' : 'ai-chat-bubble--assistant'">
              <span class="ai-chat-bubble-role">
                {{ msg.role === 'user' ? t('preview.aiChatYou') : t('preview.aiChatAssistant') }}
              </span>
              <div
                v-if="msg.role === 'assistant' && msg.content"
                class="ai-chat-bubble-content ai-chat-bubble-content--md"
                v-html="renderMarkdown(msg.content)"
              />
              <p v-else-if="msg.content" class="ai-chat-bubble-content">{{ msg.content }}</p>
              <p v-else-if="msg.streaming" class="ai-chat-bubble-content">{{ t('preview.aiAskThinking') }}</p>
            </div>
          </div>

          <div v-if="askError" class="err-line">{{ askError }}</div>

          <div class="ai-chat-input">
            <el-input v-model="question" type="textarea" :rows="3" :placeholder="t('preview.aiAskQuestionPlaceholder')"
              :disabled="asking" resize="none" @keydown.enter.exact.prevent="submitChat" />
            <div class="ai-chat-input-actions">
              <el-button type="primary" :loading="asking" :disabled="asking" @click="submitChat">
                {{ t('preview.aiAskSubmit') }}
              </el-button>
              <el-button v-if="asking" @click="stopAsk">{{ t('preview.aiAskStop') }}</el-button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVirtualizer } from '@tanstack/vue-virtual'
import fileApiService from '@api/file'
import { streamAskAboutSelection, type AiChatMessage } from '@api/ai'
import { renderMarkdown } from '@utils/renderMarkdown'

const SELECTED_PREVIEW_MAX = 200

type UiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

let chatIdSeq = 0
function genChatId(): string {
  chatIdSeq += 1
  return `chat-${Date.now()}-${chatIdSeq}`
}

const CHUNK_BYTES = 256 * 1024
/** 无换行超长行切段，避免单行 DOM 仍过高 */
const VIRTUAL_MAX_LINE = 4000

/**
 * 将常见 txt 中「为纸宽折行」的段内单换行合并，段落仍以空行分隔；合并在宽屏上由 pre-wrap 按容器宽度重排
 */
function reflowBookText(s: string): string {
  const t = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!t.trim()) return ''
  const blocks = t.split(/\n(?:[ \t\u3000]*\n)+/)
  return blocks
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.replace(/[ \t\u3000]+$/g, ''))
        .join('')
    )
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .join('\n\n')
}

const props = defineProps<{
  modelValue: boolean
  fileId: number
  fileName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const dialogTitle = computed(() =>
  props.fileName ? `${t('preview.textChunkTitle')} - ${props.fileName}` : t('preview.textChunkTitle')
)

/** 已顺序拼接的已加载原文（分块接口保证字节顺序，直接 += 与纸面折行/跨块一致） */
const rawText = ref('')
/** 为 true 时按空行分段后合并段内换行，适合纸宽排版的小说；为 false 时与文件换行一致 */
const reflowForReading = ref(true)

const lineRows = computed(() => {
  const raw = rawText.value
  if (!raw) return []
  if (!reflowForReading.value) {
    return raw.split(/\r?\n/)
  }
  const merged = reflowBookText(raw)
  if (!merged) return []
  return merged.split(/\n\n+/)
})

/** 展示行；indentFirstLine 仅对自然段首行（2 字）缩进，超长段 4k 续块不缩进 */
type DisplayRow = { text: string; indentFirstLine: boolean; isBlank?: boolean }

const displayRows = computed((): DisplayRow[] => {
  const rows = lineRows.value
  const out: DisplayRow[] = []
  const reflow = reflowForReading.value

  for (let r = 0; r < rows.length; r++) {
    const line = rows[r]!
    if (line.length === 0) {
      out.push({ text: '', indentFirstLine: false, isBlank: true })
      continue
    }

    const isNaturalParaStart = reflow
      ? true
      : r === 0 || (r > 0 && String(rows[r - 1] ?? '').trim() === '')

    if (line.length <= VIRTUAL_MAX_LINE) {
      out.push({ text: line, indentFirstLine: isNaturalParaStart })
      continue
    }

    for (let i = 0; i < line.length; i += VIRTUAL_MAX_LINE) {
      const chunk = line.slice(i, i + VIRTUAL_MAX_LINE)
      out.push({
        text: chunk,
        indentFirstLine: isNaturalParaStart && i === 0
      })
    }
  }
  return out
})

const nextOffset = ref(0)
const totalSize = ref(0)
const done = ref(false)
const initialLoading = ref(false)
const loadingMore = ref(false)
const appending = ref(false)
const loadError = ref('')
const scrollRef = ref<HTMLElement | null>(null)
const chatScrollRef = ref<HTMLElement | null>(null)
const fileEncoding = ref<'utf-8' | 'gb18030' | undefined>(undefined)

const selectedText = ref('')
const question = ref('')
const chatMessages = ref<UiChatMessage[]>([])
const asking = ref(false)
const askError = ref('')
let askAbort: AbortController | null = null

const selectedPreview = computed(() => {
  const s = selectedText.value
  if (s.length <= SELECTED_PREVIEW_MAX) return s
  return `${s.slice(0, SELECTED_PREVIEW_MAX)}…`
})

// 必须整体传入 computed，让 count 为 number；若只写 count: computed(()=>n)，Virtualizer 会把 Ref 当数字用导致 NaN，列表永远空白
const virtualizer = useVirtualizer(
  computed(() => ({
    count: displayRows.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => 25,
    overscan: 12
  }))
)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const vTotalSize = computed(() => virtualizer.value.getTotalSize())

function onRowRef(ref: Element | ComponentPublicInstance | null) {
  const el = ref && typeof ref === 'object' && '$el' in ref ? (ref as ComponentPublicInstance).$el : ref
  virtualizer.value.measureElement(el as HTMLElement)
}

let resizeUnsub: (() => void) | null = null

function attachScrollSizeObserver() {
  resizeUnsub?.()
  resizeUnsub = null
  const el = scrollRef.value
  if (typeof ResizeObserver === 'undefined' || !el) return
  const ro = new ResizeObserver(() => {
    virtualizer.value.measure()
  })
  ro.observe(el)
  resizeUnsub = () => {
    ro.disconnect()
    resizeUnsub = null
  }
}

function scheduleRemeasure() {
  void nextTick(() => {
    requestAnimationFrame(() => {
      virtualizer.value.measure()
    })
  })
}

watch(displayRows, () => {
  scheduleRemeasure()
}, { flush: 'post' })

watch(reflowForReading, () => {
  void nextTick(() => scheduleRemeasure())
})

function onDialogOpened() {
  attachScrollSizeObserver()
  scheduleRemeasure()
  setTimeout(() => virtualizer.value.measure(), 100)
}

onUnmounted(() => {
  resizeUnsub?.()
  stopAsk()
})

function scrollChatToBottom() {
  void nextTick(() => {
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function resetAiAsk() {
  stopAsk()
  selectedText.value = ''
  question.value = ''
  chatMessages.value = []
  askError.value = ''
}

function clearChat() {
  stopAsk()
  chatMessages.value = []
  question.value = ''
  askError.value = ''
}

function stopAsk() {
  askAbort?.abort()
  askAbort = null
  asking.value = false
  for (const msg of chatMessages.value) {
    if (msg.streaming) msg.streaming = false
  }
}

function captureSelection() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const root = scrollRef.value
  if (!root) return
  const anchor = sel.anchorNode
  if (!anchor || !root.contains(anchor)) return
  const text = sel.toString().trim()
  if (text) selectedText.value = text
}

async function submitChat() {
  if (asking.value) return
  askError.value = ''
  if (!selectedText.value) {
    askError.value = t('preview.aiAskNoSelection')
    return
  }
  const userContent = question.value.trim()
  if (!userContent) {
    askError.value = t('preview.aiAskNoQuestion')
    return
  }

  const history: AiChatMessage[] = chatMessages.value
    .filter((m) => !m.streaming && m.content.trim())
    .map(({ role, content }) => ({ role, content }))
  // 先画界面，再等网络
  const userId = genChatId()
  const assistantId = genChatId() // 给用户消息、AI 消息各生成唯一 id
  chatMessages.value.push({ id: userId, role: 'user', content: userContent }) // 立刻显示用户刚输入的问题
  chatMessages.value.push({ id: assistantId, role: 'assistant', content: '', streaming: true }) //立刻显示 AI 气泡，content: ''
  question.value = '' // 清空输入框，方便继续输入
  scrollChatToBottom()

  asking.value = true // 禁用发送
  askAbort = new AbortController() // 新建中止控制器，给 stopAsk() 用

  try {
    await streamAskAboutSelection({ // 调 api/ai.ts，用 fetch 读流,fetch方法支持流式输出
      fileId: props.fileId,
      question: userContent,
      selectedText: selectedText.value,
      messages: history, // 之前几轮对话，多轮上下文
      fileName: props.fileName,
      signal: askAbort.signal, // 传给 fetch；用户点「停止」会 abort()
      onChunk: (chunk) => { // 每收到一块文字就执行
        const msg = chatMessages.value.find((m) => m.id === assistantId) // 找到 AI 气泡
        if (msg) {
          msg.content += chunk //  拼字，实现打字机效果
          scrollChatToBottom() // 每来一块就滚到底
        }
      },
    })
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return //用户主动停止，不算错误，不弹错误、不删已有内容
    }
    const idx = chatMessages.value.findIndex((m) => m.id === assistantId) // 找 assistant 消息，若仍为空则 splice 删掉
    if (idx >= 0 && !chatMessages.value[idx]?.content) {
      chatMessages.value.splice(idx, 1)
    }
    const msg = e instanceof Error ? e.message : t('preview.aiAskError') // 显示后端错误或通用「提问失败」
    askError.value = msg || t('preview.aiAskError')
  } finally {
    const msg = chatMessages.value.find((m) => m.id === assistantId)
    if (msg) msg.streaming = false // 去掉「生成中」状态，停止打字机动画样式
    asking.value = false // 允许再次发送
    askAbort = null // 释放控制器引用
    scrollChatToBottom()
  }
}

function reset() {
  resetAiAsk()
  resizeUnsub?.()
  resizeUnsub = null
  rawText.value = ''
  reflowForReading.value = true
  nextOffset.value = 0
  totalSize.value = 0
  done.value = false
  initialLoading.value = false
  loadingMore.value = false
  appending.value = false
  loadError.value = ''
  fileEncoding.value = undefined
}

async function fetchChunk(fromOffset: number) {
  return fileApiService.getTextFileChunk(
    props.fileId,
    fromOffset,
    CHUNK_BYTES,
    fileEncoding.value
  )
}

async function onOpen() {
  reset()
  initialLoading.value = true
  loadError.value = ''
  try {
    const data = await fetchChunk(0)
    if (data.fileEncoding) fileEncoding.value = data.fileEncoding
    rawText.value += data.text
    nextOffset.value = data.nextOffset
    totalSize.value = data.totalSize
    done.value = data.done
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    loadError.value = msg || t('preview.textChunkError')
  } finally {
    initialLoading.value = false
    await nextTick()
    scheduleRemeasure()
  }
}

async function loadNext() {
  if (done.value || loadingMore.value) return
  loadingMore.value = true
  appending.value = true
  loadError.value = ''
  try {
    const data = await fetchChunk(nextOffset.value)
    if (data.fileEncoding) fileEncoding.value = data.fileEncoding
    rawText.value += data.text
    nextOffset.value = data.nextOffset
    if (data.totalSize) totalSize.value = data.totalSize
    done.value = data.done
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    loadError.value = msg || t('preview.textChunkError')
  } finally {
    loadingMore.value = false
    appending.value = false
    await nextTick()
    scheduleRemeasure()
  }
}

const SCROLL_LOAD_THRESHOLD = 200

function onScroll() {
  const el = scrollRef.value
  if (!el || done.value || loadingMore.value || initialLoading.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_LOAD_THRESHOLD) {
    void loadNext()
  }
}
</script>

<style lang="scss" scoped>
/* 主题里 --el-dialog-width 未覆盖时会回退到 50%（theme-chalk dialog.scss），全屏右侧大片留白时强制拉满 */
.text-chunk-preview-dialog {
  width: min(96vw, 1280px) !important;
  max-width: 96vw !important;
  box-sizing: border-box;

  :deep(.el-dialog__body) {
    padding-top: 8px;
    display: block;
    width: 100% !important;
    max-width: none !important;
    box-sizing: border-box;
  }
}

.preview-split {
  display: flex;
  gap: 14px;
  min-height: min(78vh, 720px);
  align-items: stretch;
}

.preview-split__left {
  flex: 1 1 56%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.preview-split__right {
  flex: 1 1 44%;
  min-width: 300px;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .preview-split {
    flex-direction: column;
    min-height: auto;
  }

  .preview-split__right {
    min-width: 0;
    min-height: 420px;
  }
}

.hint-line {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-line {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.text-chunk-options {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

/* 固定视口高度：仅 max-height 时父级/动画下 clientHeight 可能为 0，导致虚拟列表不渲染 */
.text-chunk-scroll {
  display: block;
  width: 100% !important;
  min-width: 0;
  max-width: none;
  flex: 1 1 auto;
  min-height: 280px;
  max-height: min(72vh, 640px);
  overflow: auto;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 12px 14px;
  box-sizing: border-box;
}

.vlist-inner {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

/* 左对齐、自然字距。首行缩进 2 字用 text-indent: 2em（与正文 em 等宽，符合中文习惯） */
.vlist-row {
  margin: 0;
  font-family: 'Sarasa Term SC', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC',
    ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: var(--el-text-color-primary);
  box-sizing: border-box;
  text-align: start;
  letter-spacing: normal;
  text-justify: auto;
}

.vlist-row--para-indent {
  text-indent: 2em;
}

.vlist-row--blank {
  min-height: 0.75em;
  pointer-events: none;
}

.vlist-appending {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 0 0;
}

.end-line,
.err-line {
  margin: 10px 0 0;
  font-size: 12px;
}

.err-line {
  color: var(--el-color-danger);
}

.footer-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ai-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: min(78vh, 720px);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank, #fff);
  overflow: hidden;
}

.ai-chat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ai-chat-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ai-chat-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
}

.ai-chat-context {
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter, #f5f7fa);
}

.ai-chat-context-label {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.ai-chat-context-text,
.ai-chat-context-empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  max-height: 72px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-chat-context-empty {
  color: var(--el-text-color-placeholder);
}

.ai-chat-messages {
  flex: 1 1 auto;
  min-height: 160px;
  overflow: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-chat-empty {
  margin: auto 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  line-height: 1.6;
}

.ai-chat-bubble {
  max-width: 92%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
}

.ai-chat-bubble--user {
  align-self: flex-end;
  background: var(--el-color-primary-light-9, #ecf5ff);
  border: 1px solid var(--el-color-primary-light-7, #c6e2ff);
}

.ai-chat-bubble--assistant {
  align-self: flex-start;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter);
}

.ai-chat-bubble-role {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
}

.ai-chat-bubble-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-primary);
}

.ai-chat-bubble-content--md {
  white-space: normal;

  :deep(p) {
    margin: 0 0 0.6em;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(strong) {
    font-weight: 600;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.4em 0 0.6em;
    padding-left: 1.4em;
  }

  :deep(li + li) {
    margin-top: 0.25em;
  }

  :deep(code) {
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.92em;
    background: var(--el-fill-color, #f0f2f5);
  }

  :deep(pre) {
    margin: 0.5em 0;
    padding: 8px 10px;
    border-radius: 6px;
    overflow: auto;
    background: var(--el-fill-color, #f0f2f5);

    code {
      padding: 0;
      background: transparent;
    }
  }

  :deep(blockquote) {
    margin: 0.5em 0;
    padding-left: 0.8em;
    border-left: 3px solid var(--el-border-color);
    color: var(--el-text-color-secondary);
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 0.6em 0 0.4em;
    font-size: 1em;
    font-weight: 600;
    line-height: 1.4;

    &:first-child {
      margin-top: 0;
    }
  }
}

.ai-chat-input {
  padding: 10px 14px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank, #fff);
}

.ai-chat-input-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
