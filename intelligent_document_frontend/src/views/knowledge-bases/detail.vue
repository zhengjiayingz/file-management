<template>
    <div class="kb-page">
        <Sidebar />
        <el-container class="main-container">
            <GlobalHeader>
                <template #left>
                    <el-button link @click="router.push('/knowledge-bases')">← 返回</el-button>
                    <h3 style="margin-left: 8px">{{ kbTitle }}</h3>
                </template>
                <template #right>
                    <el-button @click="refreshAll">刷新状态</el-button>
                    <el-button type="primary" @click="openPicker">添加文件</el-button>
                </template>
            </GlobalHeader>

            <el-main v-loading="loading" class="kb-main">
                <el-alert v-if="indexStatus" :type="indexStatus.canAsk ? 'success' : 'warning'" :closable="false"
                    show-icon style="margin-bottom: 12px">
                    <template #title>
                        <span v-if="indexStatus.total === 0">
                            知识库为空，请先添加文件
                        </span>
                        <span v-else-if="indexStatus.canAsk">
                            索引完成（{{ indexStatus.readyCount }}/{{ indexStatus.total }}），可以提问
                        </span>
                        <span v-else>
                            索引未完成（{{ indexStatus.readyCount }}/{{ indexStatus.total }}），请先完成索引后再提问。
                            未就绪：{{
                                indexStatus.notReadyFiles.map((f) => f.fileName).join('、') || '未知'
                            }}
                        </span>
                    </template>
                </el-alert>

                <div class="kb-split">
                    <!-- 左：文件 -->
                    <section class="kb-panel kb-files">
                        <header class="kb-panel-head">
                            <h4 class="kb-panel-title">库内文件</h4>
                            <span class="kb-panel-meta">{{ items.length }} 个</span>
                        </header>
                        <div class="kb-panel-body">
                            <el-table :data="items" border stripe size="small" style="width: 100%"
                                empty-text="暂无文件，点击右上角添加">
                                <el-table-column label="文件名" min-width="140" show-overflow-tooltip>
                                    <template #default="{ row }">
                                        {{ row.userFile?.fileName || `file-${row.userFileId}` }}
                                    </template>
                                </el-table-column>
                                <el-table-column label="索引" width="88" align="center">
                                    <template #default="{ row }">
                                        <el-tag
                                            :type="statusLabel(row.userFileId) === 'ready' ? 'success' : 'warning'"
                                            size="small">
                                            {{ statusLabel(row.userFileId) }}
                                        </el-tag>
                                    </template>
                                </el-table-column>
                                <el-table-column label="操作" width="72" align="center" fixed="right">
                                    <template #default="{ row }">
                                        <el-button link type="danger" @click="onRemove(row)">移除</el-button>
                                    </template>
                                </el-table-column>
                            </el-table>
                        </div>
                    </section>

                    <!-- 中：会话 -->
                    <aside class="kb-panel kb-sessions" v-loading="sessionsLoading">
                        <header class="kb-panel-head">
                            <h4 class="kb-panel-title">会话</h4>
                            <el-button size="small" type="primary" plain :disabled="asking" @click="startNewChat">
                                新对话
                            </el-button>
                        </header>
                        <div class="kb-panel-body kb-session-scroll">
                            <div
                                v-for="s in sessions"
                                :key="s.id"
                                class="kb-session-row"
                                :class="{ 'is-active': sessionId === s.id }"
                            >
                                <button
                                    type="button"
                                    class="kb-session-item"
                                    :disabled="asking"
                                    @click="openSession(s)"
                                >
                                    <span class="kb-session-title">{{ s.title || `会话 #${s.id}` }}</span>
                                    <span class="kb-session-time">{{ formatSessionTime(s.updatedAt) }}</span>
                                </button>
                                <el-button
                                    class="kb-session-delete"
                                    link
                                    type="danger"
                                    size="small"
                                    :disabled="asking"
                                    @click.stop="onDeleteSession(s)"
                                >
                                    删除
                                </el-button>
                            </div>
                            <p v-if="!sessionsLoading && sessions.length === 0" class="kb-session-empty">
                                暂无历史，发一条问题开始
                            </p>
                        </div>
                    </aside>

                    <!-- 右：对话 -->
                    <section class="kb-panel kb-chat">
                        <header class="kb-panel-head">
                            <h4 class="kb-panel-title">问答</h4>
                            <span v-if="sessionId" class="kb-panel-meta">会话 #{{ sessionId }}</span>
                            <span v-else class="kb-panel-meta">新对话</span>
                        </header>
                        <div ref="chatScrollRef" class="kb-chat-list">
                            <p v-if="chatMessages.length === 0" class="kb-chat-empty">
                                {{
                                    indexStatus?.canAsk
                                        ? '可以向整个知识库提问'
                                        : '请先完成全部文件索引'
                                }}
                            </p>
                            <div v-for="msg in chatMessages" :key="msg.id" class="kb-chat-bubble"
                                :class="msg.role === 'user' ? 'is-user' : 'is-assistant'">
                                <div v-if="msg.role === 'assistant'" class="kb-chat-content kb-chat-content--md"
                                    v-html="renderMarkdown(msg.content || (msg.streaming ? '思考中…' : ''))" />
                                <div v-else class="kb-chat-content">{{ msg.content }}</div>
                                <div v-if="msg.citations?.length" class="kb-sources">
                                    <button type="button" class="kb-sources-toggle" @click="toggleSources(msg.id)">
                                        来源 {{ uniqueSourceCount(msg.citations) }} 个文件 ·
                                        {{ msg.citations.length }} 段引用
                                        <span class="kb-sources-caret">{{
                                            expandedSourceIds.has(msg.id) ? '收起' : '展开'
                                        }}</span>
                                    </button>
                                    <div v-if="!expandedSourceIds.has(msg.id)" class="kb-source-tags">
                                        <el-tag v-for="name in uniqueSourceNames(msg.citations)" :key="name"
                                            size="small" type="info" effect="plain">
                                            {{ name }}
                                        </el-tag>
                                    </div>
                                    <ul v-else class="kb-source-list">
                                        <li v-for="(c, i) in msg.citations"
                                            :key="`${c.fileId}-${c.chunkIndex}-${i}`"
                                            class="kb-source-item is-clickable" role="button"
                                            @click="openCitation(c)">
                                            <div class="kb-source-meta">
                                                <span class="kb-source-name">{{ c.fileName }}</span>
                                                <span class="kb-source-chunk">#{{ c.chunkIndex }}</span>
                                            </div>
                                            <p class="kb-source-excerpt">{{ formatExcerpt(c.excerpt) }}</p>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="kb-chat-input">
                            <el-input v-model="question" type="textarea" :rows="2" resize="none"
                                :disabled="asking || !indexStatus?.canAsk" placeholder="输入问题，Enter 发送"
                                @keydown.enter.exact.prevent="submitChat" />
                            <el-button type="primary" :loading="asking" :disabled="asking || !indexStatus?.canAsk"
                                @click="submitChat">
                                发送
                            </el-button>
                        </div>
                        <p v-if="askError" class="kb-chat-error">{{ askError }}</p>
                    </section>
                </div>
            </el-main>
        </el-container>

        <!-- 网盘选文件（文件夹仅进入，文件才能添加） -->
        <el-dialog v-model="pickerVisible" title="选择要加入知识库的文件" width="600px" destroy-on-close>
            <div v-loading="pickerLoading">
                <el-breadcrumb separator="/" style="margin-bottom: 15px">
                    <el-breadcrumb-item style="cursor: pointer" @click="pickFolder()">
                        根目录
                    </el-breadcrumb-item>
                    <el-breadcrumb-item v-for="f in breadcrumbs" :key="f.id" style="cursor: pointer"
                        @click="pickFolder(f.id)">
                        {{ f.name }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <el-table :data="pickFiles" height="300" @row-click="onPickRow">
                    <el-table-column label="名称" min-width="200">
                        <template #default="{ row }">
                            <span>{{ row.fileType === 'folder' ? '📁' : '📄' }} {{ row.fileName }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column width="100" align="center">
                        <template #default="{ row }">
                            <el-button v-if="row.fileType === 'file'" link type="primary" @click.stop="confirmAdd(row)">
                                添加
                            </el-button>
                            <el-button v-else link type="info" @click.stop="pickFolder(row.id, row.fileName)">
                                进入
                            </el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
        </el-dialog>

        <PdfDocumentPreviewDialog v-model="pdfPreviewVisible" :file-id="previewFileId" :file-name="previewFileName" />
        <TextChunkPreviewDialog v-model="textPreviewVisible" :file-id="textPreviewFileId"
            :file-name="textPreviewFileName" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import Sidebar from '../index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import fileApiService from '@api/file'
import type { FileItem } from '@/types/file'
import { renderMarkdown } from '@utils/renderMarkdown'
import {
    addKnowledgeBaseItem,
    deleteKbSession,
    getKnowledgeBaseIndexStatus,
    listKbSessions,
    listKbSessionMessages,
    listKnowledgeBases,
    listKnowledgeBaseItems,
    removeKnowledgeBaseItem,
    streamKnowledgeBaseChat,
    type KbCitation,
    type KnowledgeBaseItem,
    type KnowledgeBaseIndexStatus,
    type KbSession,
} from '@/api/knowledge-bases'

import PdfDocumentPreviewDialog from '@components/PdfDocumentPreviewDialog/index.vue'
import TextChunkPreviewDialog from '@components/TextChunkPreviewDialog/index.vue'

type UiChatMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    streaming?: boolean
    citations?: KbCitation[]
}

const route = useRoute()
const router = useRouter()

const kbId = computed(() => Number(route.params.id))
const kbTitle = ref('知识库')
const loading = ref(false)
const items = ref<KnowledgeBaseItem[]>([])
const indexStatus = ref<KnowledgeBaseIndexStatus | null>(null)

const pickerVisible = ref(false)
const pickerLoading = ref(false)
const pickFiles = ref<FileItem[]>([])
const breadcrumbs = ref<{ id: number; name: string }[]>([])

const chatMessages = ref<UiChatMessage[]>([])
const question = ref('')
const asking = ref(false)
const askError = ref('')
const sessionId = ref<number | undefined>(undefined)
const chatScrollRef = ref<HTMLElement | null>(null)
/** 哪些助手消息展开了「来源」详情 */
const expandedSourceIds = ref(new Set<string>())
let chatIdSeq = 0
let abortCtrl: AbortController | null = null

const pdfPreviewVisible = ref(false)
const previewFileId = ref<number | undefined>(undefined)
const previewFileName = ref('')
const textPreviewVisible = ref(false)
const textPreviewFileId = ref(0)
const textPreviewFileName = ref('')

const sessions = ref<KbSession[]>([])
const sessionsLoading = ref(false)

function genId() {
    chatIdSeq += 1
    return `kb-chat-${Date.now()}-${chatIdSeq}`
}

function uniqueSourceNames(citations: KbCitation[]) {
    return [...new Set(citations.map((c) => c.fileName).filter(Boolean))]
}

function uniqueSourceCount(citations: KbCitation[]) {
    return uniqueSourceNames(citations).length
}

function toggleSources(msgId: string) {
    const next = new Set(expandedSourceIds.value)
    if (next.has(msgId)) next.delete(msgId)
    else next.add(msgId)
    expandedSourceIds.value = next
}

/** 展示用：缓解 PDF 抽文本时英文粘连（库内原文仍可能缺空格） */
function formatExcerpt(text: string) {
    return text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .replace(/([.!?,:;])([A-Za-z])/g, '$1 $2')
        .replace(/(["'”)\]}])([A-Za-z])/g, '$1 $2')
        .replace(/([a-zA-Z])([\u4e00-\u9fff])/g, '$1 $2')
        .replace(/([\u4e00-\u9fff])([A-Za-z])/g, '$1 $2')
}

/** 会话列表用短时间 */
function formatSessionTime(v: string) {
    try {
        const d = new Date(v)
        const now = new Date()
        const sameDay =
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate()
        if (sameDay) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        return d.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
    } catch {
        return v
    }
}

function statusLabel(userFileId: number) {
    const f = indexStatus.value?.files.find((x) => x.userFileId === userFileId)
    if (!f) return '未知'
    if (f.ready) return 'ready'
    return f.indexStatus || '未索引'
}

async function scrollChat() {
    await nextTick()
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
}

async function loadMeta() {
    const list = await listKnowledgeBases()
    const kb = list.find((x) => x.id === kbId.value)
    kbTitle.value = kb?.name || `知识库 #${kbId.value}`
}

async function loadItems() {
    loading.value = true
    try {
        items.value = await listKnowledgeBaseItems(kbId.value)
    } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '加载失败')
    } finally {
        loading.value = false
    }
}

async function loadIndexStatus() {
    try {
        indexStatus.value = await getKnowledgeBaseIndexStatus(kbId.value)
    } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '索引状态加载失败')
    }
}

async function refreshAll() {
    await loadItems()
    await loadIndexStatus()
    await loadSessions()
}

function openPicker() {
    pickerVisible.value = true
    pickFolder()
}

async function pickFolder(folderId?: number, folderName?: string) {
    if (folderId === undefined) {
        breadcrumbs.value = []
    } else if (folderName) {
        const idx = breadcrumbs.value.findIndex((b) => b.id === folderId)
        if (idx !== -1) breadcrumbs.value = breadcrumbs.value.slice(0, idx + 1)
        else breadcrumbs.value.push({ id: folderId, name: folderName })
    }

    pickerLoading.value = true
    try {
        pickFiles.value = await fileApiService.getFiles({ parentId: folderId })
    } catch {
        ElMessage.error('加载网盘文件失败')
    } finally {
        pickerLoading.value = false
    }
}

function onPickRow(row: FileItem) {
    if (row.fileType === 'folder') pickFolder(row.id, row.fileName)
}

async function confirmAdd(row: FileItem) {
    if (row.fileType !== 'file') return
    try {
        await addKnowledgeBaseItem(kbId.value, row.id)
        ElMessage.success(`已添加：${row.fileName}`)
        pickerVisible.value = false
        await refreshAll()
    } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '添加失败')
    }
}

async function onRemove(row: KnowledgeBaseItem) {
    const name = row.userFile?.fileName || String(row.userFileId)
    try {
        await ElMessageBox.confirm(`从知识库移除「${name}」？（不删除网盘文件）`, '确认', {
            type: 'warning',
        })
        await removeKnowledgeBaseItem(kbId.value, row.userFileId)
        ElMessage.success('已移除')
        await refreshAll()
    } catch (e: any) {
        if (e === 'cancel' || e === 'close') return
        ElMessage.error(e?.response?.data?.message || e?.message || '移除失败')
    }
}

function openCitation(c: KbCitation) {
    const name = c.fileName || ''
    if (/\.pdf$/i.test(name)) {
        previewFileId.value = c.fileId
        previewFileName.value = name
        pdfPreviewVisible.value = true
        return
    }
    if (/\.(txt|md|markdown)$/i.test(name)) {
        textPreviewFileId.value = c.fileId
        textPreviewFileName.value = name
        textPreviewVisible.value = true
        return
    }
    ElMessage.info('暂不支持在此预览该类型，请到网盘打开')
}

async function submitChat() {
    const q = question.value.trim()
    if (!q || asking.value || !indexStatus.value?.canAsk) return

    askError.value = ''
    asking.value = true
    question.value = ''

    const userMsgId = genId()
    const assistantId = genId()
    chatMessages.value.push({ id: userMsgId, role: 'user', content: q })
    chatMessages.value.push({
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
    })
    await scrollChat()

    abortCtrl?.abort()
    abortCtrl = new AbortController()

    try {
        const meta = await streamKnowledgeBaseChat({
            knowledgeBaseId: kbId.value,
            question: q,
            sessionId: sessionId.value,
            signal: abortCtrl.signal,
            onChunk: (chunk) => {
                const msg = chatMessages.value.find((m) => m.id === assistantId)
                if (msg) msg.content += chunk
                void scrollChat()
            },
        })
        if (meta.sessionId) sessionId.value = meta.sessionId
        await loadSessions()
        const msg = chatMessages.value.find((m) => m.id === assistantId)
        if (msg) {
            msg.streaming = false
            msg.citations = meta.citations
        }
    } catch (e: any) {
        if (e?.name === 'AbortError') return
        askError.value = e?.message || '提问失败'
        const idx = chatMessages.value.findIndex((m) => m.id === assistantId)
        if (idx >= 0 && !chatMessages.value[idx]?.content) {
            chatMessages.value.splice(idx, 1)
        }
    } finally {
        asking.value = false
        const msg = chatMessages.value.find((m) => m.id === assistantId)
        if (msg) msg.streaming = false
    }
}

async function loadSessions() {
  if (!kbId.value) return
  sessionsLoading.value = true
  try {
    sessions.value = await listKbSessions(kbId.value)
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '加载会话失败')
  } finally {
    sessionsLoading.value = false
  }
}

async function openSession(s: KbSession) {
  if (asking.value) return
  sessionId.value = s.id
  askError.value = ''
  expandedSourceIds.value = new Set()
  try {
    const msgs = await listKbSessionMessages(kbId.value, s.id)
    chatMessages.value = msgs.map((m) => ({
      id: `db-${m.id}`,
      role: m.role,
      content: m.content,
      citations: Array.isArray(m.citations) ? m.citations : undefined,
    }))
    await nextTick()
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '加载消息失败')
  }
}

function startNewChat() {
  if (asking.value) return
  sessionId.value = undefined
  chatMessages.value = []
  askError.value = ''
  expandedSourceIds.value = new Set()
}

async function onDeleteSession(s: KbSession) {
  if (asking.value) return
  try {
    await ElMessageBox.confirm(
      `删除会话「${s.title || `#${s.id}`}」？消息将一并删除。`,
      '确认删除',
      { type: 'warning' },
    )
    await deleteKbSession(kbId.value, s.id)
    ElMessage.success('会话已删除')
    if (sessionId.value === s.id) {
      startNewChat()
    }
    await loadSessions()
  } catch (e: unknown) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(
      (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ||
        (e as Error)?.message ||
        '删除失败',
    )
  }
}

onMounted(async () => {
    if (!Number.isFinite(kbId.value) || kbId.value <= 0) {
        ElMessage.error('无效的知识库 id')
        router.replace('/knowledge-bases')
        return
    }
    try {
        await loadMeta()
        await loadSessions()
    } catch {
        /* 标题兜底已有 */
    }
    await refreshAll()
})

onUnmounted(() => {
    abortCtrl?.abort()
})
</script>

<style scoped>
.kb-page {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

.main-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
}

.kb-main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 12px 16px 16px;
}

.kb-split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(240px, 1fr) 200px minmax(320px, 1.35fr);
    gap: 12px;
}

.kb-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    background: var(--el-bg-color);
    overflow: hidden;
}

.kb-panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    flex-shrink: 0;
}

.kb-panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}

.kb-panel-meta {
    margin-left: auto;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.kb-panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px;
}

.kb-files .kb-panel-body {
    padding: 0;
}

.kb-session-scroll {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
}

.kb-session-row {
    display: flex;
    align-items: stretch;
    gap: 2px;
    border: 1px solid transparent;
    border-radius: 8px;
    transition: background 0.15s ease, border-color 0.15s ease;
}

.kb-session-row:hover {
    background: var(--el-fill-color-light);
}

.kb-session-row.is-active {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
}

.kb-session-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
    padding: 8px 8px 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
}

.kb-session-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.kb-session-delete {
    flex-shrink: 0;
    align-self: center;
    margin-right: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
}

.kb-session-row:hover .kb-session-delete,
.kb-session-row.is-active .kb-session-delete {
    opacity: 1;
}

.kb-session-title {
    font-size: 13px;
    line-height: 1.35;
    color: var(--el-text-color-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
}

.kb-session-time {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
}

.kb-session-empty {
    margin: 12px 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
    text-align: center;
}

.kb-chat-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px;
}

.kb-chat-bubble {
    margin-bottom: 14px;
    max-width: 100%;
}

.kb-chat-bubble.is-user .kb-chat-content {
    background: var(--el-color-primary-light-9);
    padding: 8px 10px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
}

.kb-chat-bubble.is-assistant .kb-chat-content {
    padding: 2px 0;
    word-break: break-word;
}

.kb-sources {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--el-border-color-lighter);
}

.kb-sources-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    cursor: pointer;
}

.kb-sources-toggle:hover {
    color: var(--el-color-primary);
}

.kb-sources-caret {
    color: var(--el-color-primary);
}

.kb-source-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.kb-source-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.kb-source-item {
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
}

.kb-source-item.is-clickable {
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
}

.kb-source-item.is-clickable:hover {
    background: var(--el-fill-color);
    border-color: var(--el-color-primary-light-5);
}

.kb-source-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.kb-source-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.kb-source-chunk {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
}

.kb-source-excerpt {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.kb-chat-input {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--el-border-color-lighter);
    align-items: flex-end;
    flex-shrink: 0;
}

.kb-chat-input :deep(.el-textarea__inner) {
    min-height: 64px !important;
}

.kb-chat-error {
    color: var(--el-color-danger);
    padding: 0 12px 8px;
    margin: 0;
    font-size: 12px;
}

.kb-chat-empty {
    margin: 24px 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-align: center;
}

@media (max-width: 1100px) {
    .kb-split {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(160px, 28%) minmax(120px, 22%) minmax(280px, 1fr);
        overflow: auto;
    }

    .kb-panel {
        min-height: 0;
    }
}
</style>
