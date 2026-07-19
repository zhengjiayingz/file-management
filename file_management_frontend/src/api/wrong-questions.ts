import request from '@utils/request'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export type WrongQuestionDifficulty = 'easy' | 'medium' | 'hard'

export const WRONG_QUESTION_DIFFICULTIES: WrongQuestionDifficulty[] = [
  'easy',
  'medium',
  'hard',
]

export type WrongQuestionItem = {
  id: number
  userId: number
  userFileId: number | null
  questionText: string
  answerText: string
  tags: string[]
  difficulty: WrongQuestionDifficulty
  createdAt: string
  updatedAt: string
  fileName: string | null
  imageAvailable: boolean
}

export type WrongQuestionListResult = {
  items: WrongQuestionItem[]
  total: number
  page: number
  pageSize: number
}

export type CreateWrongQuestionBody = {
  userFileId: number
  /** 可空：服务端会对原图 OCR 补全题干 */
  questionText?: string
  answerText: string
  tags?: string[]
  difficulty?: WrongQuestionDifficulty
}

export type UpdateWrongQuestionBody = {
  questionText?: string
  answerText?: string
  tags?: string[]
  difficulty?: WrongQuestionDifficulty
}

export type StreamWrongQuestionFollowUpParams = {
  id: number
  question: string
  messages?: { role: 'user' | 'assistant'; content: string }[]
  signal?: AbortSignal
  onChunk: (text: string) => void
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
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { message?: string }
      if (typeof data.message === 'string') message = data.message
      else if (Array.isArray(data.message)) message = data.message.join('; ')
    } catch {
      /* ignore */
    }
  }
  return message
}

/** 存入错题本 */
export async function createWrongQuestion(
  body: CreateWrongQuestionBody,
): Promise<WrongQuestionItem> {
  const res = await request.post<WrongQuestionItem>('/wrong-questions', body)
  return res.data
}

/** 用原图 OCR 刷新题干 */
export async function refreshWrongQuestionStem(
  id: number,
): Promise<WrongQuestionItem> {
  const res = await request.post<WrongQuestionItem>(
    `/wrong-questions/${id}/refresh-question`,
  )
  return res.data
}

/** 错题本列表 */
export async function listWrongQuestions(params?: {
  page?: number
  pageSize?: number
  tag?: string
  difficulty?: WrongQuestionDifficulty
  createdFrom?: string
  createdTo?: string
}): Promise<WrongQuestionListResult> {
  const res = await request.get<WrongQuestionListResult>('/wrong-questions', {
    params,
  })
  return res.data
}

/** 错题详情 */
export async function getWrongQuestion(id: number): Promise<WrongQuestionItem> {
  const res = await request.get<WrongQuestionItem>(`/wrong-questions/${id}`)
  return res.data
}

/** 更新错题 */
export async function updateWrongQuestion(
  id: number,
  body: UpdateWrongQuestionBody,
): Promise<WrongQuestionItem> {
  const res = await request.patch<WrongQuestionItem>(
    `/wrong-questions/${id}`,
    body,
  )
  return res.data
}

/** 删除错题（不删网盘文件） */
export async function deleteWrongQuestion(id: number): Promise<void> {
  await request.delete(`/wrong-questions/${id}`)
}

/** 错题二次追问（text/plain 流式） */
export async function streamWrongQuestionFollowUp(
  params: StreamWrongQuestionFollowUpParams,
): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('未登录')

  const res = await fetch(
    `${API_BASE_URL}/api/wrong-questions/${params.id}/follow-up`,
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
