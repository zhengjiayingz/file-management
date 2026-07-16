import request from '@utils/request'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export interface KnowledgeBase {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeBaseItem {
  id: number
  knowledgeBaseId: number
  userFileId: number
  createdAt: string
  userFile: {
    id: number
    fileName: string
    fileType: string
    isDeleted?: boolean
  }
}

export interface KnowledgeBaseIndexFile {
  userFileId: number
  fileName: string
  indexStatus: string | null
  ready: boolean
}
export interface KnowledgeBaseIndexStatus {
  total: number
  readyCount: number
  canAsk: boolean
  files: KnowledgeBaseIndexFile[]
  notReadyFiles: Array<{
    userFileId: number
    fileName: string
    indexStatus: string | null
  }>
}

export interface KbCitation {
  fileId: number
  fileName: string
  chunkIndex: number
  excerpt: string
}

export interface KbSession {
  id: number
  title: string | null
  createdAt: string
  updatedAt: string
}
export interface KbMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  citations: KbCitation[] | null
  createdAt: string
}

export type StreamKbChatParams = {
  knowledgeBaseId: number
  question: string
  sessionId?: number
  signal?: AbortSignal
  onChunk: (text: string) => void
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const res = await request.get<KnowledgeBase[]>('/knowledge-bases')
  return res.data
}

export async function createKnowledgeBase(body: {
  name: string
  description?: string
}): Promise<KnowledgeBase> {
  const res = await request.post<KnowledgeBase>('/knowledge-bases', body)
  return res.data
}

export async function updateKnowledgeBase(
  id: number,
  body: { name?: string; description?: string },
): Promise<KnowledgeBase> {
  const res = await request.patch<KnowledgeBase>(`/knowledge-bases/${id}`, body)
  return res.data
}

export async function deleteKnowledgeBase(
  id: number,
): Promise<{ success: boolean; message: string }> {
  const res = await request.delete<{ success: boolean; message: string }>(
    `/knowledge-bases/${id}`,
  )
  return res.data
}

export async function listKnowledgeBaseItems(
  kbId: number,
): Promise<KnowledgeBaseItem[]> {
  const res = await request.get<KnowledgeBaseItem[]>(
    `/knowledge-bases/${kbId}/items`,
  )
  return res.data
}
export async function addKnowledgeBaseItem(
  kbId: number,
  userFileId: number,
): Promise<KnowledgeBaseItem> {
  const res = await request.post<KnowledgeBaseItem>(
    `/knowledge-bases/${kbId}/items`,
    { userFileId },
  )
  return res.data
}
export async function removeKnowledgeBaseItem(
  kbId: number,
  userFileId: number,
): Promise<{ success: boolean; message: string }> {
  const res = await request.delete<{ success: boolean; message: string }>(
    `/knowledge-bases/${kbId}/items/${userFileId}`,
  )
  return res.data
}

/** 获取知识库索引状态，包含哪些文件已索引、哪些未索引 */
export async function getKnowledgeBaseIndexStatus(
  kbId: number,
): Promise<KnowledgeBaseIndexStatus> {
  const res = await request.get<KnowledgeBaseIndexStatus>(
    `/knowledge-bases/${kbId}/index-status`,
  )
  return res.data
}

/** 解码响应头中的 citations 字段 */
function decodeCitationsHeader(raw: string | null): KbCitation[] {
  if (!raw) return []
  try {
    // base64url → UTF-8 JSON（不可直接 atob 当字符串，中文会乱码）
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const binary = atob(b64 + pad)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const json = new TextDecoder('utf-8').decode(bytes)
    const parsed = JSON.parse(json) as KbCitation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function readTextStream(
  res: Response,
  onChunk: (text: string) => void,
): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) onChunk(decoder.decode(value, { stream: true }))
  }
  onChunk(decoder.decode())
}

async function parseStreamError(res: Response): Promise<string> {
  let message = `请求失败 (${res.status})`
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      const data = (await res.json()) as { message?: string }
      if (data.message) message = data.message
    } catch {
      /* ignore */
    }
  }
  return message
}

/** 知识库流式问答：正文 text/plain；sessionId/citations 在响应头 */
export async function streamKnowledgeBaseChat(
  params: StreamKbChatParams,
): Promise<{ sessionId: number | null; citations: KbCitation[] }> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('未登录')
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge-bases/${params.knowledgeBaseId}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: params.question,
        sessionId: params.sessionId,
      }),
      signal: params.signal,
    },
  )
  if (!res.ok) {
    throw new Error(await parseStreamError(res))
  }
  const sessionRaw = res.headers.get('X-Session-Id')
  const sessionId = sessionRaw ? Number(sessionRaw) : null
  const citations = decodeCitationsHeader(res.headers.get('X-Citations'))
  await readTextStream(res, params.onChunk)
  return {
    sessionId: Number.isFinite(sessionId as number) ? (sessionId as number) : null,
    citations,
  }
}

/** 获取知识库会话列表 */
export async function listKbSessions(kbId: number): Promise<KbSession[]> {
  const res = await request.get<KbSession[]>(`/knowledge-bases/${kbId}/sessions`)
  return res.data
}

/** 获取知识库某个会话消息列表 */
export async function listKbSessionMessages(
  kbId: number,
  sessionId: number,
): Promise<KbMessage[]> {
  const res = await request.get<KbMessage[]>(
    `/knowledge-bases/${kbId}/sessions/${sessionId}/messages`,
  )
  return res.data
}

/** 删除知识库会话（含消息） */
export async function deleteKbSession(
  kbId: number,
  sessionId: number,
): Promise<{ success: boolean; message: string }> {
  const res = await request.delete<{ success: boolean; message: string }>(
    `/knowledge-bases/${kbId}/sessions/${sessionId}`,
  )
  return res.data
}
