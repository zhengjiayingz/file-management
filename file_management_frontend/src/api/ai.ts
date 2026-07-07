const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
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

/**
 * 基于选中文字向 AI 多轮提问（text/plain 流式响应，须用 fetch，勿用 axios）
 * 成功时无返回值（void），内容通过 onChunk 回调往外传
 */
export async function streamAskAboutSelection(params: StreamAskAboutSelectionParams): Promise<void> {
  const token = localStorage.getItem('token') //登录校验
  if (!token) {
    throw new Error('未登录')
  }
  const res = await fetch(`${API_BASE_URL}/api/files/${params.fileId}/ai/ask`, { //在响应头到达后 resolve，不等待整个 body
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
    signal: params.signal, // AbortSignal：用户点「停止」时 abort()，fetch 会中断并抛 AbortError
  })

  if (!res.ok) { // res.ok 为 false（4xx/5xx）走错误分支
    let message = `请求失败 (${res.status})`
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) { // 若是 JSON 错误体（如 400 校验失败、401 未登录），尝试解析 { message } 作为提示
      try {
        const data = (await res.json()) as { message?: string }
        if (data.message) message = data.message
      } catch { // JSON 解析失败则忽略，仍用默认文案
        /* ignore parse error */
      }
    }
    throw new Error(message)
  }

  const reader = res.body?.getReader() // res.body 是 ReadableStream；getReader() 得到流读取器，用于按块读
  if (!reader) {
    throw new Error('无法读取响应流')
  }

  const decoder = new TextDecoder()
  while (true) { // 循环读流 + 解码
    const { done, value } = await reader.read()
    if (done) break
    if (value) { // 有数据则解码，并 onChunk 传给 UI
      params.onChunk(decoder.decode(value, { stream: true })) 
    }
  }
  params.onChunk(decoder.decode()) // 流结束后再 decode() 一次（无参），flush 解码器里剩余字符
}
