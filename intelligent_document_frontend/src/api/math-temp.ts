import request from '@utils/request'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export type MathTempUploadResult = {
  tempImageId: string
  expiresAt: string
}

export type TempAiChatMode = 'selection' | 'solve'

/** 上传临时截图（不进网盘列表） */
export async function uploadMathTempImage(
  file: Blob,
  fileName = 'capture.png',
): Promise<MathTempUploadResult> {
  const form = new FormData()
  form.append('file', file, fileName)
  const res = await request.post<{
    success: boolean
    data: MathTempUploadResult
  }>('/ai/math-temp-images', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.data
}

export async function deleteMathTempImage(tempImageId: string): Promise<void> {
  await request.delete(`/ai/math-temp-images/${tempImageId}`)
}

export async function saveMathTempToDrive(
  tempImageId: string,
  body?: {
    folderId?: number
    fileName?: string
    includeTranscript?: boolean
    copyChat?: boolean
  },
): Promise<{ userFileId: number; transcriptFileId: number | null }> {
  const res = await request.post<{
    success: boolean
    data: { userFileId: number; transcriptFileId: number | null }
  }>(`/ai/math-temp-images/${tempImageId}/save-to-drive`, body ?? {})
  return res.data.data
}

export async function createWrongQuestionFromTemp(body: {
  tempImageId: string
  answerText: string
  questionText?: string
  tags?: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
  fileName?: string
}): Promise<{ id: number }> {
  const res = await request.post<{ id: number }>('/wrong-questions/from-temp', body)
  return res.data
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

async function parseErrorResponse(res: Response): Promise<string> {
  let message = `请求失败 (${res.status})`
  try {
    const data = (await res.json()) as { message?: string }
    if (typeof data.message === 'string') message = data.message
  } catch {
    /* ignore */
  }
  return message
}

/** 临时图自然语言问答（流式） */
export async function streamMathTempAsk(params: {
  tempImageId: string
  question: string
  messages?: { role: 'user' | 'assistant'; content: string }[]
  signal?: AbortSignal
  onChunk: (text: string) => void
}): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('未登录')
  const res = await fetch(
    `${API_BASE_URL}/api/ai/math-temp-images/${params.tempImageId}/ask`,
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
  if (!res.ok) throw new Error(await parseErrorResponse(res))
  await readTextStream(res, params.onChunk)
}

/** 临时图解题（流式） */
export async function streamMathTempSolve(params: {
  tempImageId: string
  question: string
  messages?: { role: 'user' | 'assistant'; content: string }[]
  signal?: AbortSignal
  onChunk: (text: string) => void
}): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('未登录')
  const res = await fetch(
    `${API_BASE_URL}/api/ai/math-temp-images/${params.tempImageId}/solve`,
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
  if (!res.ok) throw new Error(await parseErrorResponse(res))
  await readTextStream(res, params.onChunk)
}

export async function getTempAiChatSession(
  tempImageId: string,
  mode: TempAiChatMode,
): Promise<{
  sessionId: number
  mode: TempAiChatMode
  messages: {
    id: number
    role: 'user' | 'assistant'
    content: string
    meta: unknown
    createdAt: string
  }[]
}> {
  const res = await request.get<{
    success: boolean
    data: {
      sessionId: number
      mode: TempAiChatMode
      messages: {
        id: number
        role: 'user' | 'assistant'
        content: string
        meta: unknown
        createdAt: string
      }[]
    }
  }>(`/ai/math-temp-images/${tempImageId}/chat-sessions/${mode}`)
  return res.data.data
}

export async function appendTempAiChatMessage(
  tempImageId: string,
  mode: TempAiChatMode,
  body: { role: 'user' | 'assistant'; content: string },
): Promise<void> {
  await request.post(
    `/ai/math-temp-images/${tempImageId}/chat-sessions/${mode}/messages`,
    body,
  )
}
