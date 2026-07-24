import type { AiChatMessage } from '@api/ai'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

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

async function parseErrorResponse(res: Response): Promise<string> {
  let message = `请求失败 (${res.status})`
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { message?: string }
      if (data.message) message = data.message
    } catch {
      /* ignore */
    }
  }
  return message
}

/** 网盘 AI 助手（Function Calling；text/plain 流式） */
export type StreamAssistantChatParams = {
  message: string
  messages?: AiChatMessage[]
  parentId?: number | null
  signal?: AbortSignal
  onChunk: (text: string) => void
}

export async function streamAssistantChat(
  params: StreamAssistantChatParams,
): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('未登录')
  const res = await fetch(`${API_BASE_URL}/api/ai/assistant/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: params.message,
      messages: params.messages,
      parentId: params.parentId,
    }),
    signal: params.signal,
  })
  if (!res.ok) {
    throw new Error(await parseErrorResponse(res))
  }
  await readTextStream(res, params.onChunk)
}
