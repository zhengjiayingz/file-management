// 获取配置
function getVisionConfig() {
  const baseURL = (
    process.env.AI_VISION_BASE_URL?.trim() || 'https://api.siliconflow.cn/v1'
  ).replace(/\/$/, '');
  const apiKey =
    process.env.AI_VISION_API_KEY?.trim() ||
    process.env.AI_EMBEDDING_API_KEY?.trim() ||
    '';
  if (!apiKey) {
    throw new Error('Missing environment variable: AI_VISION_API_KEY');
  }
  return {
    apiKey,
    baseURL,
    model: process.env.AI_VISION_MODEL?.trim() || 'deepseek-ai/DeepSeek-OCR',
  };
}

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

// 把响应解析成JSON对象
async function parseChatResponse(
  res: Response,
): Promise<ChatCompletionsResponse> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(`Vision OCR API 返回了空响应（HTTP ${res.status}）`);
  }
  try {
    return JSON.parse(raw) as ChatCompletionsResponse;
  } catch {
    const preview = raw.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      `Vision OCR API 返回了非 JSON 响应（HTTP ${res.status}）：${preview}`,
    );
  }
}

/**
 * 图片 → 纯文本（硅基流动 DeepSeek-OCR，OpenAI 兼容 chat/completions）
 */
export async function extractTextFromImage(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const mime = (mimeType || 'image/png').trim().toLowerCase() || 'image/png';
  if (!mime.startsWith('image/')) {
    throw new Error(`不支持的图片 MIME：${mime}`);
  }
  if (!buffer.length) {
    throw new Error('图片内容为空，无法 OCR');
  }
  const { apiKey, baseURL, model } = getVisionConfig();
  // 将图片转换为 base64字符串
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  // 把 base64 字符串丢到 /chat/completions，带上Authorization: Bearer <apiKey>
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
            {
              type: 'text',
              text: 'Free OCR.',
            },
          ],
        },
      ],
    }),
  });
  // 拿到 JSON 响应
  const json = await parseChatResponse(res);
  if (!res.ok) {
    throw new Error(
      json.error?.message || `Vision OCR API failed: ${res.status}`,
    );
  }
  // 从JSON响应中提取纯文本内容
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    throw new Error('OCR 未识别到可用文字');
  }
  return text;
}
