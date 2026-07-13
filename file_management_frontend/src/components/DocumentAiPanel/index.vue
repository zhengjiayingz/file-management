<template>
  <div class="ai-chat-panel">
    <header class="ai-chat-header">
      <div>
        <h4 class="ai-chat-title">{{ t('preview.aiAskTitle') }}</h4>
        <p class="ai-chat-hint">
          {{ chatMode === 'selection' ? t('preview.aiAskHint') : t('preview.aiRagHint') }}
        </p>
      </div>
      <el-button v-if="chatMessages.length > 0" size="small" text type="danger" @click="clearChat">
        {{ t('preview.aiChatClear') }}
      </el-button>
    </header>

    <div class="ai-index-bar">
      <el-select
        v-model="summaryGenre"
        size="small"
        class="ai-index-genre"
        :disabled="indexTriggering || indexPolling"
      >
        <el-option-group
          v-for="group in SUMMARY_GENRE_GROUPS"
          :key="group.groupKey"
          :label="t(`preview.aiSummaryGenreGroup.${group.groupKey}`)"
        >
          <el-option
            v-for="genre in group.genres"
            :key="genre"
            :label="t(`preview.aiSummaryGenre.${genre}`)"
            :value="genre"
          />
        </el-option-group>
      </el-select>
      <el-button
        size="small"
        type="primary"
        plain
        :loading="indexTriggering"
        :disabled="indexTriggering || indexPolling"
        @click="triggerIndex"
      >
        {{ indexTriggerLabel }}
      </el-button>
      <span class="ai-index-status">{{ indexStatusLabel }}</span>
    </div>

    <el-tabs v-model="rightPanelTab" class="ai-right-tabs">
      <el-tab-pane :label="t('preview.aiTabChat')" name="chat">
        <div class="ai-chat-tab">
          <div class="ai-chat-mode">
            <el-radio-group v-model="chatMode" size="small">
              <el-radio-button value="selection">{{ t('preview.aiChatModeSelection') }}</el-radio-button>
              <el-radio-button value="rag">{{ t('preview.aiChatModeRag') }}</el-radio-button>
            </el-radio-group>
          </div>

          <div v-if="chatMode === 'selection'" class="ai-chat-context">
            <span class="ai-chat-context-label">{{ t('preview.aiChatContext') }}</span>
            <p v-if="selectedText" class="ai-chat-context-text">{{ selectedPreview }}</p>
            <p v-else class="ai-chat-context-empty">{{ t('preview.aiAskSelectedEmpty') }}</p>
          </div>

          <div ref="chatScrollRef" class="ai-chat-messages">
            <p v-if="chatMessages.length === 0" class="ai-chat-empty">{{ t('preview.aiChatEmpty') }}</p>
            <div
              v-for="msg in chatMessages"
              :key="msg.id"
              class="ai-chat-bubble"
              :class="msg.role === 'user' ? 'ai-chat-bubble--user' : 'ai-chat-bubble--assistant'"
            >
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
            <el-input
              v-model="question"
              type="textarea"
              :rows="3"
              :placeholder="t('preview.aiAskQuestionPlaceholder')"
              :disabled="asking"
              resize="none"
              @keydown.enter.exact.prevent="submitChat"
            />
            <div class="ai-chat-input-actions">
              <el-button type="primary" :loading="asking" :disabled="asking" @click="submitChat">
                {{ t('preview.aiAskSubmit') }}
              </el-button>
              <el-button v-if="asking" @click="stopAsk">{{ t('preview.aiAskStop') }}</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane :label="t('preview.aiTabSummary')" name="summary">
        <SummaryPanel
          :summary-genre="summaryData?.summaryGenre ?? indexStatus?.summaryGenre ?? null"
          :payload="summaryData?.payload ?? null"
          :loading="summaryLoading"
          :error="summaryError"
          :ready="indexStatus?.status === 'ready'"
        />
      </el-tab-pane>
      <el-tab-pane v-if="showKnowledgeTab" :label="t('preview.aiTabKnowledge')" name="knowledge">
        <KnowledgePanel
          :summary-genre="knowledgeData?.summaryGenre ?? indexStatus?.summaryGenre ?? null"
          :payload="knowledgeData?.payload ?? null"
          :loading="knowledgeLoading"
          :error="knowledgeError"
          :ready="indexStatus?.status === 'ready'"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getDocumentIndexStatus,
  getDocumentSummary,
  getDocumentKnowledge,
  streamAskAboutSelection,
  streamRagAsk,
  triggerDocumentIndex,
  SUMMARY_GENRE_GROUPS,
  type AiChatMessage,
  type DocumentIndexStatus,
  type DocumentIndexStatusData,
  type DocumentKnowledgeData,
  type DocumentSummaryData,
  type SummaryGenre,
} from '@api/ai'
import { renderMarkdown } from '@utils/renderMarkdown'
import SummaryPanel from '@components/SummaryPanel/index.vue'
import KnowledgePanel from '@components/KnowledgePanel/index.vue'

const SELECTED_PREVIEW_MAX = 200
const INDEX_POLL_INTERVAL_MS = 2500

const INDEX_ACTIVE_STATUSES: DocumentIndexStatus[] = [
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'summarizing',
  'extracting_knowledge',
]

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

const props = defineProps<{
  fileId: number
  fileName?: string
  selectedText?: string
}>()

const emit = defineEmits<{
  (e: 'update:selectedText', v: string): void
}>()

const { t } = useI18n()

const selectedText = computed({
  get: () => props.selectedText ?? '',
  set: (v) => emit('update:selectedText', v),
})

const question = ref('')
const chatMode = ref<'selection' | 'rag'>('selection')
const chatMessages = ref<UiChatMessage[]>([])
const asking = ref(false)
const askError = ref('')
let askAbort: AbortController | null = null

const indexStatus = ref<DocumentIndexStatusData | null>(null)
const indexTriggering = ref(false)
const indexPolling = ref(false)
let indexPollTimer: ReturnType<typeof setInterval> | null = null

const summaryGenre = ref<SummaryGenre>('novel')
const rightPanelTab = ref<'chat' | 'summary' | 'knowledge'>('chat')
const summaryData = ref<DocumentSummaryData | null>(null)
const summaryLoading = ref(false)
const summaryError = ref('')
const knowledgeData = ref<DocumentKnowledgeData | null>(null)
const knowledgeLoading = ref(false)
const knowledgeError = ref('')
const chatScrollRef = ref<HTMLElement | null>(null)

const showKnowledgeTab = computed(() => {
  const genre = indexStatus.value?.summaryGenre ?? summaryGenre.value
  return genre === 'paper' || genre === 'lab_report'
})

const selectedPreview = computed(() => {
  const s = selectedText.value
  if (s.length <= SELECTED_PREVIEW_MAX) return s
  return `${s.slice(0, SELECTED_PREVIEW_MAX)}…`
})

const indexStatusLabel = computed(() => {
  const data = indexStatus.value
  if (!data || data.status === 'none') {
    return t('preview.aiIndexStatusNone')
  }
  if (data.status === 'ready') {
    return t('preview.aiIndexStatusReady', { count: data.chunkCount })
  }
  if (data.status === 'failed') {
    return t('preview.aiIndexStatusFailed', {
      reason: data.errorMessage || t('preview.jobUnknownError'),
    })
  }
  if (INDEX_ACTIVE_STATUSES.includes(data.status)) {
    return t('preview.aiIndexStatusPending', {
      msg: data.progressMsg || data.status,
      progress: data.progress,
    })
  }
  return data.status
})

const indexTriggerLabel = computed(() =>
  indexStatus.value?.status === 'ready' || indexStatus.value?.status === 'failed'
    ? t('preview.aiIndexRetrigger')
    : t('preview.aiIndexTrigger'),
)

watch(rightPanelTab, (tab) => {
  if (tab === 'summary' && indexStatus.value?.status === 'ready' && !summaryData.value && !summaryLoading.value) {
    void loadSummary()
  }
  if (tab === 'knowledge' && indexStatus.value?.status === 'ready' && !knowledgeData.value && !knowledgeLoading.value) {
    void loadKnowledge()
  }
})

watch(showKnowledgeTab, (visible) => {
  if (!visible && rightPanelTab.value === 'knowledge') {
    rightPanelTab.value = 'chat'
  }
})

onUnmounted(() => {
  stopAsk()
  stopIndexPolling()
})

function stopIndexPolling() {
  if (indexPollTimer) {
    clearInterval(indexPollTimer)
    indexPollTimer = null
  }
  indexPolling.value = false
}

function shouldPollIndex(status: DocumentIndexStatus): boolean {
  return INDEX_ACTIVE_STATUSES.includes(status)
}

async function refreshIndexStatus() {
  try {
    const data = await getDocumentIndexStatus(props.fileId)
    const prevStatus = indexStatus.value?.status
    indexStatus.value = data
    if (data.summaryGenre) {
      summaryGenre.value = data.summaryGenre
    }
    if (data.status === 'ready' && prevStatus !== 'ready') {
      void loadSummary()
      if (rightPanelTab.value === 'knowledge') {
        void loadKnowledge()
      }
    }
    if (shouldPollIndex(data.status)) {
      if (!indexPollTimer) {
        indexPolling.value = true
        indexPollTimer = setInterval(() => {
          void refreshIndexStatus()
        }, INDEX_POLL_INTERVAL_MS)
      }
    } else {
      stopIndexPolling()
    }
  } catch {
    /* 索引状态查询失败时保持当前展示 */
  }
}

async function loadSummary() {
  if (indexStatus.value?.status !== 'ready') {
    summaryData.value = null
    return
  }
  summaryLoading.value = true
  summaryError.value = ''
  try {
    summaryData.value = await getDocumentSummary(props.fileId, { type: 'book' })
  } catch (e: unknown) {
    summaryData.value = null
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      t('preview.aiSummaryLoadError')
    summaryError.value = msg
  } finally {
    summaryLoading.value = false
  }
}

async function loadKnowledge() {
  if (indexStatus.value?.status !== 'ready') {
    knowledgeData.value = null
    return
  }
  if (!showKnowledgeTab.value) {
    knowledgeData.value = null
    return
  }
  knowledgeLoading.value = true
  knowledgeError.value = ''
  try {
    knowledgeData.value = await getDocumentKnowledge(props.fileId)
  } catch (e: unknown) {
    knowledgeData.value = null
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      t('preview.aiKnowledgeLoadError')
    knowledgeError.value = msg
  } finally {
    knowledgeLoading.value = false
  }
}

async function triggerIndex() {
  if (indexTriggering.value) return
  indexTriggering.value = true
  summaryData.value = null
  summaryError.value = ''
  knowledgeData.value = null
  knowledgeError.value = ''
  const force =
    indexStatus.value?.status === 'ready' || indexStatus.value?.status === 'failed'
  try {
    const data = await triggerDocumentIndex(props.fileId, summaryGenre.value, { force })
    indexStatus.value = data
    if (shouldPollIndex(data.status)) {
      stopIndexPolling()
      indexPolling.value = true
      indexPollTimer = setInterval(() => {
        void refreshIndexStatus()
      }, INDEX_POLL_INTERVAL_MS)
    }
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message || t('preview.aiIndexTriggerError')
    askError.value = msg
  } finally {
    indexTriggering.value = false
  }
}

function scrollChatToBottom() {
  void nextTick(() => {
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
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

async function submitChat() {
  if (asking.value) return
  askError.value = ''
  const userContent = question.value.trim()
  if (!userContent) {
    askError.value = t('preview.aiAskNoQuestion')
    return
  }

  if (chatMode.value === 'selection') {
    if (!selectedText.value) {
      askError.value = t('preview.aiAskNoSelection')
      return
    }
  } else if (indexStatus.value?.status !== 'ready') {
    askError.value = t('preview.aiRagNotReady')
    return
  }

  const history: AiChatMessage[] = chatMessages.value
    .filter((m) => !m.streaming && m.content.trim())
    .map(({ role, content }) => ({ role, content }))
  const userId = genChatId()
  const assistantId = genChatId()
  chatMessages.value.push({ id: userId, role: 'user', content: userContent })
  chatMessages.value.push({ id: assistantId, role: 'assistant', content: '', streaming: true })
  question.value = ''
  scrollChatToBottom()

  asking.value = true
  askAbort = new AbortController()

  try {
    const streamParams = {
      fileId: props.fileId,
      question: userContent,
      messages: history,
      signal: askAbort.signal,
      onChunk: (chunk: string) => {
        const msg = chatMessages.value.find((m) => m.id === assistantId)
        if (msg) {
          msg.content += chunk
          scrollChatToBottom()
        }
      },
    }

    if (chatMode.value === 'selection') {
      await streamAskAboutSelection({
        ...streamParams,
        selectedText: selectedText.value,
        fileName: props.fileName,
      })
    } else {
      await streamRagAsk(streamParams)
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return
    }
    const idx = chatMessages.value.findIndex((m) => m.id === assistantId)
    if (idx >= 0 && !chatMessages.value[idx]?.content) {
      chatMessages.value.splice(idx, 1)
    }
    const msg = e instanceof Error ? e.message : t('preview.aiAskError')
    askError.value = msg || t('preview.aiAskError')
  } finally {
    const msg = chatMessages.value.find((m) => m.id === assistantId)
    if (msg) msg.streaming = false
    asking.value = false
    askAbort = null
    scrollChatToBottom()
  }
}

function reset() {
  stopAsk()
  stopIndexPolling()
  selectedText.value = ''
  question.value = ''
  chatMessages.value = []
  askError.value = ''
  indexStatus.value = null
  indexTriggering.value = false
  chatMode.value = 'selection'
  rightPanelTab.value = 'chat'
  summaryGenre.value = 'novel'
  summaryData.value = null
  summaryLoading.value = false
  summaryError.value = ''
  knowledgeData.value = null
  knowledgeLoading.value = false
  knowledgeError.value = ''
}

function activate() {
  void refreshIndexStatus()
}

defineExpose({ reset, activate })
</script>

<style lang="scss" scoped>
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

.ai-index-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank, #fff);
}

.ai-index-status {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.ai-index-genre {
  width: 148px;
  flex-shrink: 0;
}

.ai-right-tabs {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 14px;
  }

  :deep(.el-tabs__content) {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  :deep(.el-tab-pane) {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}

.ai-chat-tab {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ai-chat-mode {
  padding: 8px 14px 0;
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
}

.err-line {
  margin: 0 14px 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.ai-chat-input {
  padding: 10px 14px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.ai-chat-input-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
