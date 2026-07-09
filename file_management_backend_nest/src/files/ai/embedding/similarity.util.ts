export type EmbeddingItem = {
  id: number;
  embedding: number[];
};
// 余弦相似度,大模型训练的时候以向量来表示文本含义，所以计算两句话的向量的cos值来表示两句话的相似度
// cosθ= a·b / |a|·|b|
// a·b = a1*b1 + a2*b2 + ... + an*bn
// |a| = sqrt(a1^2 + a2^2 + ... + an^2)
// |b| = sqrt(b1^2 + b2^2 + ... + bn^2)
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 按与 query 的 cosine 相似度降序，返回 Top-K 的 id 列表 */
export function topKByEmbedding(
  query: number[],
  items: EmbeddingItem[],
  k: number,
): number[] {
  if (k <= 0 || items.length === 0) {
    return [];
  }

  const scored = items
    .filter(
      (item) => Array.isArray(item.embedding) && item.embedding.length > 0,
    )
    .map((item) => ({
      id: item.id,
      score: cosineSimilarity(query, item.embedding),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((item) => item.id);
}
