import sharp from 'sharp';

import { requireEnv } from '@/files/ai/utils/env.util';

/** 送入 embedding 前最长边像素上限，控制 base64 体积 */
const MAX_EMBED_EDGE = 1024;

function getImageEmbeddingConfig() {
  const baseURL = (
    process.env.AI_IMAGE_EMBEDDING_BASE_URL?.trim() ||
    process.env.AI_EMBEDDING_BASE_URL?.trim() ||
    process.env.AI_VISION_BASE_URL?.trim() ||
    'https://api.siliconflow.cn/v1'
  ).replace(/\/$/, '');
  const apiKey =
    process.env.AI_IMAGE_EMBEDDING_API_KEY?.trim() ||
    process.env.AI_EMBEDDING_API_KEY?.trim() ||
    process.env.AI_VISION_API_KEY?.trim() ||
    requireEnv('AI_API_KEY');
  return {
    apiKey,
    baseURL,
    model:
      process.env.AI_IMAGE_EMBEDDING_MODEL?.trim() ||
      'Qwen/Qwen3-VL-Embedding-8B',
  };
}

type EmbeddingsResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
};

/**
 * 压缩/转 JPEG，再拼 data URL，供硅基 VL Embedding 使用。
 */
export async function prepareImageDataUrl(
  buffer: Buffer,
  mimeHint?: string | null,
): Promise<string> {
  if (!buffer.length) {
    throw new Error('图片内容为空');
  }
  const resized = await sharp(buffer)
    .rotate()
    .resize(MAX_EMBED_EDGE, MAX_EMBED_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  void mimeHint;
  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

async function parseEmbeddingsResponse(
  res: Response,
): Promise<EmbeddingsResponse> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(`Image Embedding API 返回了空响应（HTTP ${res.status}）`);
  }
  try {
    return JSON.parse(raw) as EmbeddingsResponse;
  } catch {
    const preview = raw.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      `Image Embedding API 返回了非 JSON 响应（HTTP ${res.status}）：${preview}`,
    );
  }
}

/**
 * 单张图片 → 视觉向量（硅基 Qwen3-VL-Embedding）。
 * input 格式：{ image: "data:image/jpeg;base64,..." }
 */
export async function embedImage(buffer: Buffer, mimeHint?: string | null) {
  const { apiKey, baseURL, model } = getImageEmbeddingConfig();
  const dataUrl = await prepareImageDataUrl(buffer, mimeHint);
  //! 发送请求到硅基 VL Embedding API，把图片转成向量
  const res = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: { image: dataUrl },
    }),
  });
  //! 解析响应
  const json = await parseEmbeddingsResponse(res);
  if (!res.ok) {
    throw new Error(
      json.error?.message || `Image Embedding API failed: ${res.status}`,
    );
  }
  //! 解析响应
  const row = json.data?.[0];
  if (!Array.isArray(row?.embedding) || row.embedding.length === 0) {
    throw new Error('Image Embedding API 返回了空向量');
  }
  //! 返回向量
  return row.embedding;
}
