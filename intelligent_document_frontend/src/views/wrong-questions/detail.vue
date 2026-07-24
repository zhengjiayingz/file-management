<template>
  <div class="wrong-book-detail">
    <Sidebar />
    <el-container class="main-container">
      <GlobalHeader>
        <template #left>
          <el-button link @click="router.push('/wrong-questions')">← {{ t('wrongBook.backList') }}</el-button>
          <h3>{{ t('wrongBook.detailTitle') }}</h3>
        </template>
        <template #right>
          <el-radio-group v-model="viewMode" size="small" class="view-mode">
            <el-radio-button value="practice">{{ t('wrongBook.modePractice') }}</el-radio-button>
            <el-radio-button value="solution">{{ t('wrongBook.modeSolution') }}</el-radio-button>
          </el-radio-group>
          <el-button type="danger" plain :disabled="!item" @click="onDelete">{{ t('wrongBook.delete') }}</el-button>
        </template>
      </GlobalHeader>

      <el-main v-loading="loading">
        <template v-if="item">
          <div class="detail-grid">
            <aside class="detail-image">
              <p v-if="!item.imageAvailable || !item.userFileId" class="warn">
                {{ t('wrongBook.imageUnavailable') }}
              </p>
              <el-image
                v-else
                class="preview-img"
                :src="imageUrl"
                fit="contain"
              />
              <p class="file-name">{{ item.fileName || '—' }}</p>
            </aside>

            <section class="detail-main">
              <div class="block">
                <div class="block-head">
                  <h4>{{ t('wrongBook.colQuestion') }}</h4>
                  <el-button
                    v-if="!editingQuestion"
                    size="small"
                    text
                    type="primary"
                    :disabled="questionOcrLoading"
                    @click="startEditQuestion"
                  >
                    {{ t('wrongBook.editQuestion') }}
                  </el-button>
                </div>
                <div v-loading="questionOcrLoading" class="question-body">
                  <template v-if="editingQuestion">
                    <el-input
                      v-model="questionDraft"
                      type="textarea"
                      :rows="6"
                      :placeholder="t('wrongBook.questionPlaceholder')"
                    />
                    <div class="tags-edit" style="margin-top: 8px">
                      <el-button size="small" type="primary" plain :loading="savingQuestion" @click="saveQuestion">
                        {{ t('wrongBook.saveQuestion') }}
                      </el-button>
                      <el-button size="small" :disabled="savingQuestion" @click="cancelEditQuestion">
                        {{ t('wrongBook.cancelEditQuestion') }}
                      </el-button>
                    </div>
                  </template>
                  <template v-else>
                    <p v-if="questionOcrError" class="warn">{{ questionOcrError }}</p>
                    <div
                      v-else-if="item.questionText"
                      class="md"
                      v-html="renderMarkdown(normalizeOcrMath(item.questionText))"
                    />
                    <p v-else class="warn">{{ t('wrongBook.questionEmpty') }}</p>
                  </template>
                </div>
              </div>

              <div v-if="viewMode === 'solution'" class="block">
                <h4>{{ t('wrongBook.colAnswer') }}</h4>
                <div class="md" v-html="renderMarkdown(item.answerText)" />
              </div>
              <p v-else class="mode-hint">{{ t('wrongBook.modePracticeHint') }}</p>

              <div class="block">
                <h4>{{ t('wrongBook.colDifficulty') }}</h4>
                <div class="tags-edit">
                  <el-select
                    v-model="difficultyDraft"
                    size="small"
                    class="difficulty-select"
                    :disabled="savingMeta"
                    @change="saveDifficulty"
                  >
                    <el-option
                      v-for="d in WRONG_QUESTION_DIFFICULTIES"
                      :key="d"
                      :label="t(`wrongBook.difficulty.${d}`)"
                      :value="d"
                    />
                  </el-select>
                </div>
              </div>

              <div class="block">
                <h4>{{ t('wrongBook.colTags') }}</h4>
                <div class="tags-edit">
                  <el-select
                    v-model="tagsDraft"
                    multiple
                    filterable
                    allow-create
                    default-first-option
                    clearable
                    collapse-tags
                    collapse-tags-tooltip
                    :max-collapse-tags="3"
                    size="small"
                    class="tags-select"
                    :placeholder="t('wrongBook.tagsPlaceholder')"
                    :disabled="savingTags"
                  >
                    <el-option
                      v-for="tag in tagOptions"
                      :key="tag"
                      :label="tag"
                      :value="tag"
                    />
                  </el-select>
                  <el-button size="small" type="primary" plain :loading="savingTags" @click="saveTags">
                    {{ t('wrongBook.saveTags') }}
                  </el-button>
                </div>
              </div>

              <div class="block follow-up">
                <h4>{{ t('wrongBook.followUp') }}</h4>
                <p v-if="!item.imageAvailable" class="warn">{{ t('wrongBook.followUpNeedImage') }}</p>
                <div ref="chatScrollRef" class="chat">
                  <div
                    v-for="msg in followMessages"
                    :key="msg.id"
                    class="bubble"
                    :class="msg.role === 'user' ? 'bubble--user' : 'bubble--ai'"
                  >
                    <span class="role">
                      {{ msg.role === 'user' ? t('preview.aiChatYou') : t('preview.aiChatAssistant') }}
                    </span>
                    <div
                      v-if="msg.role === 'assistant' && msg.content"
                      class="content md"
                      v-html="renderMarkdown(msg.content)"
                    />
                    <p v-else-if="msg.content" class="content">{{ msg.content }}</p>
                    <p v-else-if="msg.streaming" class="content">{{ t('preview.aiAskThinking') }}</p>
                  </div>
                </div>
                <div v-if="followError" class="err">{{ followError }}</div>
                <el-input
                  v-model="followQuestion"
                  type="textarea"
                  :rows="3"
                  :disabled="asking || !item.imageAvailable"
                  :placeholder="t('wrongBook.followUpPlaceholder')"
                  @keydown.enter.exact.prevent="submitFollowUp"
                />
                <div class="actions">
                  <el-button
                    type="primary"
                    :loading="asking"
                    :disabled="asking || !item.imageAvailable"
                    @click="submitFollowUp"
                  >
                    {{ t('wrongBook.followUpSubmit') }}
                  </el-button>
                  <el-button v-if="asking" @click="stopFollowUp">{{ t('preview.aiAskStop') }}</el-button>
                </div>
              </div>
            </section>
          </div>
        </template>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import Sidebar from '@/views/index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import { renderMarkdown } from '@utils/renderMarkdown'
import { useAuthStore } from '@stores/auth'
import {
  WRONG_QUESTION_DIFFICULTIES,
  deleteWrongQuestion,
  getWrongQuestion,
  listWrongQuestions,
  refreshWrongQuestionStem,
  streamWrongQuestionFollowUp,
  updateWrongQuestion,
  type WrongQuestionDifficulty,
  type WrongQuestionItem,
} from '@api/wrong-questions'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

type UiMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const item = ref<WrongQuestionItem | null>(null)
/** 刷题：隐藏题解；题解：展示 AI 参考答案 */
const viewMode = ref<'practice' | 'solution'>('practice')
/** 当前条目考点草稿（多选） */
const tagsDraft = ref<string[]>([])
/** 已有考点选项（来自错题本全量） */
const tagOptions = ref<string[]>([])
const savingTags = ref(false)
const difficultyDraft = ref<WrongQuestionDifficulty>('medium')
const savingMeta = ref(false)
const questionOcrLoading = ref(false)
const questionOcrError = ref('')
const editingQuestion = ref(false)
const questionDraft = ref('')
const savingQuestion = ref(false)

const followMessages = ref<UiMsg[]>([])
const followQuestion = ref('')
const followError = ref('')
const asking = ref(false)
const chatScrollRef = ref<HTMLElement | null>(null)
let askAbort: AbortController | null = null
let msgSeq = 0

const imageUrl = computed(() => {
  const id = item.value?.userFileId
  if (!id) return ''
  const token = authStore.token || ''
  // 与图片预览一致：download + preview=true（/preview 是 Office 专用会失败）
  return `${API_BASE_URL}/api/files/${id}/download?token=${encodeURIComponent(token)}&preview=true`
})

/** OCR 常见 \(...\) 转成 KaTeX 可用的 $...$ */
function normalizeOcrMath(text: string): string {
  return text
    .replace(/\\\((.+?)\\\)/gs, (_m, inner: string) => `$${inner}$`)
    .replace(/\\\[(.+?)\\\]/gs, (_m, inner: string) => `$$${inner}$$`)
}

/** 题干无效（占位/提示词）时需自动 OCR */
function needsAutoOcr(questionText: string): boolean {
  const q = questionText.trim()
  if (!q) return true
  if (
    q === '见原题图片' ||
    q === '見原題圖片' ||
    q === 'See original image'
  ) {
    return true
  }
  if (
    q.includes('请根据题目图片分步解答') ||
    q.includes('公式使用 LaTeX') ||
    q.includes('Please solve step by step')
  ) {
    return true
  }
  return false
}

function genId() {
  msgSeq += 1
  return `fq-${Date.now()}-${msgSeq}`
}

function scrollChat() {
  nextTick(() => {
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 打开详情：自动从原图识别题干（无需用户点按钮） */
async function ensureQuestionFromOcr() {
  if (!item.value?.imageAvailable) return
  if (!needsAutoOcr(item.value.questionText)) return

  questionOcrLoading.value = true
  questionOcrError.value = ''
  try {
    item.value = await refreshWrongQuestionStem(item.value.id)
  } catch (e) {
    questionOcrError.value =
      (e instanceof Error ? e.message : '') || t('wrongBook.refreshQuestionError')
  } finally {
    questionOcrLoading.value = false
  }
}

function startEditQuestion() {
  if (!item.value || questionOcrLoading.value) return
  questionDraft.value = item.value.questionText
  editingQuestion.value = true
}

function cancelEditQuestion() {
  editingQuestion.value = false
  questionDraft.value = item.value?.questionText ?? ''
}

async function saveQuestion() {
  if (!item.value) return
  const questionText = questionDraft.value.trim()
  if (!questionText) {
    ElMessage.warning(t('wrongBook.questionRequired'))
    return
  }
  savingQuestion.value = true
  try {
    item.value = await updateWrongQuestion(item.value.id, { questionText })
    editingQuestion.value = false
    questionOcrError.value = ''
    ElMessage.success(t('wrongBook.saveQuestionSuccess'))
  } catch (e) {
    ElMessage.error(
      (e instanceof Error ? e.message : '') || t('wrongBook.saveQuestionError'),
    )
  } finally {
    savingQuestion.value = false
  }
}

async function load() {
  const id = Number(route.params.id)
  if (!Number.isFinite(id)) {
    ElMessage.error(t('wrongBook.loadError'))
    return
  }
  loading.value = true
  questionOcrError.value = ''
  editingQuestion.value = false
  try {
    item.value = await getWrongQuestion(id)
    tagsDraft.value = [...(item.value.tags || [])]
    difficultyDraft.value = item.value.difficulty || 'medium'
    await ensureQuestionFromOcr()
    void refreshTagOptions()
  } catch (e) {
    ElMessage.error((e instanceof Error ? e.message : '') || t('wrongBook.loadError'))
    item.value = null
  } finally {
    loading.value = false
  }
}

async function saveDifficulty() {
  if (!item.value) return
  if (difficultyDraft.value === item.value.difficulty) return
  savingMeta.value = true
  try {
    item.value = await updateWrongQuestion(item.value.id, {
      difficulty: difficultyDraft.value,
    })
    ElMessage.success(t('wrongBook.saveDifficultySuccess'))
  } catch (e) {
    difficultyDraft.value = item.value.difficulty
    ElMessage.error(
      (e instanceof Error ? e.message : '') || t('wrongBook.saveDifficultyError'),
    )
  } finally {
    savingMeta.value = false
  }
}

async function refreshTagOptions() {
  try {
    const res = await listWrongQuestions({ page: 1, pageSize: 100 })
    const set = new Set<string>()
    for (const row of res.items) {
      for (const tag of row.tags || []) {
        const t0 = tag.trim()
        if (t0) set.add(t0)
      }
    }
    for (const tag of tagsDraft.value) {
      const t0 = tag.trim()
      if (t0) set.add(t0)
    }
    tagOptions.value = [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  } catch {
    /* 选项刷新失败不影响编辑 */
  }
}

async function saveTags() {
  if (!item.value) return
  const tags = tagsDraft.value.map((s) => s.trim()).filter(Boolean)
  savingTags.value = true
  try {
    item.value = await updateWrongQuestion(item.value.id, { tags })
    tagsDraft.value = [...(item.value.tags || [])]
    ElMessage.success(t('wrongBook.saveTagsSuccess'))
    void refreshTagOptions()
  } catch (e) {
    ElMessage.error((e instanceof Error ? e.message : '') || t('wrongBook.saveTagsError'))
  } finally {
    savingTags.value = false
  }
}

async function onDelete() {
  if (!item.value) return
  try {
    await ElMessageBox.confirm(t('wrongBook.deleteConfirm'), t('wrongBook.delete'), {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteWrongQuestion(item.value.id)
    ElMessage.success(t('wrongBook.deleteSuccess'))
    void router.push('/wrong-questions')
  } catch (e) {
    ElMessage.error((e instanceof Error ? e.message : '') || t('wrongBook.deleteError'))
  }
}

function stopFollowUp() {
  askAbort?.abort()
  askAbort = null
  asking.value = false
}

async function submitFollowUp() {
  if (!item.value?.imageAvailable || asking.value) return
  const q = followQuestion.value.trim()
  if (!q) return

  const history = followMessages.value
    .filter((m) => !m.streaming && m.content)
    .map((m) => ({ role: m.role, content: m.content }))

  const userId = genId()
  const assistantId = genId()
  followMessages.value.push({ id: userId, role: 'user', content: q })
  followMessages.value.push({
    id: assistantId,
    role: 'assistant',
    content: '',
    streaming: true,
  })
  followQuestion.value = ''
  followError.value = ''
  scrollChat()

  asking.value = true
  askAbort = new AbortController()
  try {
    await streamWrongQuestionFollowUp({
      id: item.value.id,
      question: q,
      messages: history,
      signal: askAbort.signal,
      onChunk: (chunk) => {
        const msg = followMessages.value.find((m) => m.id === assistantId)
        if (msg) {
          msg.content += chunk
          scrollChat()
        }
      },
    })
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    const idx = followMessages.value.findIndex((m) => m.id === assistantId)
    if (idx >= 0 && !followMessages.value[idx]?.content) {
      followMessages.value.splice(idx, 1)
    }
    followError.value =
      (e instanceof Error ? e.message : '') || t('wrongBook.followUpError')
  } finally {
    const msg = followMessages.value.find((m) => m.id === assistantId)
    if (msg) msg.streaming = false
    asking.value = false
    askAbort = null
    scrollChat()
  }
}

watch(
  () => route.params.id,
  () => {
    followMessages.value = []
    void load()
  },
)

onMounted(() => {
  void load()
})

onUnmounted(() => {
  stopFollowUp()
})
</script>

<style scoped lang="scss">
.wrong-book-detail {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-container :deep(.el-main) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.detail-grid {
  display: flex;
  gap: 16px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.detail-image {
  flex: 0 0 36%;
  min-width: 240px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 12px;
  background: #1a1a1a;
  overflow: hidden;
}

.preview-img {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;

  :deep(.el-image__inner) {
    max-height: 100%;
    object-fit: contain;
  }
}

.file-name {
  margin: 0;
  font-size: 12px;
  color: #ddd;
  word-break: break-all;
  flex-shrink: 0;
}

/* 右侧题干/解答/追问：栏内滚动，不撑开整页 */
.detail-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.block {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--el-bg-color);
  flex-shrink: 0;

  h4 {
    margin: 0;
    font-size: 14px;
  }
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.plain {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
}

.question-body {
  min-height: 48px;
}

.md {
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;

  :deep(p) {
    margin: 0 0 0.6em;
    &:last-child {
      margin-bottom: 0;
    }
  }
}

.tags-edit {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.tags-select {
  flex: 1;
  min-width: 0;
}

.difficulty-select {
  width: 160px;
}

.warn {
  color: var(--el-color-warning);
  font-size: 13px;
}

.mode-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.view-mode {
  margin-right: 12px;
}

.follow-up .chat {
  max-height: 280px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.bubble {
  max-width: 92%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.bubble--user {
  align-self: flex-end;
  background: var(--el-color-primary-light-9);
}

.bubble--ai {
  align-self: flex-start;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.role {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
}

.content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble--ai .content.md {
  white-space: normal;
}

.actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.err {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-bottom: 6px;
}

@media (max-width: 900px) {
  .detail-grid {
    flex-direction: column;
    overflow: auto;
  }

  .detail-image {
    flex: none;
    height: 240px;
  }

  .detail-main {
    flex: 1 1 auto;
    min-height: 280px;
  }
}
</style>
