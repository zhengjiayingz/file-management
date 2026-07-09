import request from '@utils/request'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type DocumentIndexStatus =
  | 'none'
  | 'pending'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'summarizing'
  | 'extracting_knowledge'
  | 'ready'
  | 'failed'

export type DocumentIndexStatusData = {
  status: DocumentIndexStatus
  mode: 'general' | 'academic' | null
  progress: number
  progressMsg: string | null
  chunkCount: number
  errorMessage: string | null
  updatedAt: string | null
}

export type StreamAskAboutSelectionParams = {
  fileId: number
  question: string
  selectedText: string
  messages?: AiChatMessage[]
  fileName?: string
  signal?: AbortSignal
  onChunk: (text: string) => void
}

export type StreamRagAskParams = {
  fileId: number
  question: string
  messages?: AiChatMessage[]
  signal?: AbortSignal
  onChunk: (text: string) => void
}

async function readTextStream(
  res: Response,
  onChunk: (text: string) => void,
): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('无法读取响应流')
  }

  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      onChunk(decoder.decode(value, { stream: true }))
    }
  }
  onChunk(decoder.decode())
}

async function parseErrorResponse(res: Response): Promise<string> {
  let message = `请求失败 (${res.status})`
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { message?: string }
      if (data.message) message = data.message
    } catch {
      /* ignore parse error */
    }
  }
  return message
}

/** 触发文档索引（异步，需 Worker 消费队列） */
export async function triggerDocumentIndex(
  fileId: number,
  mode: 'general' | 'academic' = 'general',
): Promise<DocumentIndexStatusData> {
  const res = await request.post<{
    success: boolean
    data: DocumentIndexStatusData
  }>(`/files/${fileId}/ai/index`, { mode })
  return res.data.data
}

/** 查询文档索引进度 */
export async function getDocumentIndexStatus(
  fileId: number,
): Promise<DocumentIndexStatusData> {
  const res = await request.get<{
    success: boolean
    data: DocumentIndexStatusData
  }>(`/files/${fileId}/ai/index/status`)
  return res.data.data
}

/**
 * 基于选中文字向 AI 多轮提问（text/plain 流式响应，须用 fetch，勿用 axios）
 * 成功时无返回值（void），内容通过 onChunk 回调往外传
 */
export async function streamAskAboutSelection(
  params: StreamAskAboutSelectionParams,
): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('未登录')
  }
  const res = await fetch(`${API_BASE_URL}/api/files/${params.fileId}/ai/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question: params.question,
      selectedText: params.selectedText,
      messages: params.messages,
      fileName: params.fileName,
    }),
    signal: params.signal,
  })

  if (!res.ok) {
    throw new Error(await parseErrorResponse(res))
  }

  await readTextStream(res, params.onChunk)
}

/**
 * 基于文档索引的 RAG 多轮问答（text/plain 流式）
 */
export async function streamRagAsk(params: StreamRagAskParams): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('未登录')
  }
  const res = await fetch(
    `${API_BASE_URL}/api/files/${params.fileId}/ai/rag-ask`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: params.question,
        messages: params.messages,
      }),
      signal: params.signal,
    },
  )

  if (!res.ok) {
    throw new Error(await parseErrorResponse(res))
  }

  await readTextStream(res, params.onChunk)
}
