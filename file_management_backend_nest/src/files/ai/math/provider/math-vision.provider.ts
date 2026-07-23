export type MathVisionConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

/** 解析解题 VL 环境变量（与 OCR AI_VISION_*、文本 AI_* 分线） */
export function getMathVisionConfig(): MathVisionConfig {
  const baseURL = (
    process.env.AI_MATH_VISION_BASE_URL?.trim() ||
    'https://api.siliconflow.cn/v1'
  ).replace(/\/$/, '');

  const apiKey =
    process.env.AI_MATH_VISION_API_KEY?.trim() ||
    process.env.AI_VISION_API_KEY?.trim() ||
    '';

  if (!apiKey) {
    throw new Error('Missing environment variable: AI_MATH_VISION_API_KEY');
  }

  const model =
    process.env.AI_MATH_VISION_MODEL?.trim() || 'Qwen/Qwen3-VL-8B-Instruct';

  return { apiKey, baseURL, model };
}

type ChatCompletionsErrorBody = {
  error?: { message?: string };
  message?: string;
};

/** 流式解题：手写硅基 SSE，强制 image_url + data URL（避免 AI SDK 图片 URL 格式被拒） */
// ! 核心函数：流式解题，imageDataUrl是图片转了base64的data url
export async function streamMathVisionChat(input: {
  imageDataUrl: string;
  system: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  question: string;
  abortSignal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<void> {
  // 复用现有 env 解析
  const { apiKey, baseURL, model } = getMathVisionConfig();
  //! 构建 messages 带上 role：system、history、question，图片 image_url
  const messages = [
    { role: 'system' as const, content: input.system },
    ...input.history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: [
        { type: 'image_url' as const, image_url: { url: input.imageDataUrl } },
        { type: 'text' as const, text: input.question },
      ],
    },
  ];

  //! 发送请求，带上上面构造的messages
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, stream: true, messages }),
    signal: input.abortSignal,
  });

  if (!res.ok) {
    // 解析 error.message 或 raw
    const raw = await res.text();
    let message = `Math Vision API failed: ${res.status}`;
    try {
      const json = JSON.parse(raw) as ChatCompletionsErrorBody;
      message = json.error?.message || json.message || message;
    } catch {
      if (raw.trim()) {
        message = raw.slice(0, 200);
      }
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error('Math Vision API 未返回响应流');
  }

  // !读 SSE：按行解析 data: {...}，取出 choices[0].delta.content，调用 onChunk
  // !遇到 data: [DONE] 结束
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // 把这块 Uint8Array 解成字符串，拼到 buffer
    buffer += decoder.decode(value, { stream: true });
    // 格式化，按行分割
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    // 遍历本轮所有完整行。
    for (const line of lines) {
      const trimmed = line.trim();
      // 如果行不以 data: 开头，跳过
      if (!trimmed.startsWith('data:')) continue;
      // 去掉 data: 前缀，得到 JSON 字符串
      const payload = trimmed.slice(5).trim();
      // 如果 JSON 字符串为空或等于 [DONE]，则是结束标记，跳过
      if (!payload || payload === '[DONE]') continue;
      try {
        // 把 payload 解析成 JSON对象，并声明我们关心的类型形状。
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null } }>;
        };
        // 取出增量文字：choices[0].delta.content（OpenAI 兼容流式格式
        const chunk = json.choices?.[0]?.delta?.content;
        // 有文字就 onChunk(chunk)，交给 Service 写给前端。
        if (chunk) {
          input.onChunk(chunk);
        }
      } catch {
        // 忽略非整段 JSON 的 SSE 行
      }
    }
  }
}
