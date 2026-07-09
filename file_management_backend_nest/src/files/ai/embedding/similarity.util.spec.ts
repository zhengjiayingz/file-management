import { cosineSimilarity, topKByEmbedding } from './similarity.util';

describe('similarity.util', () => {
  it('相同向量 cosine 应为 1', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('正交向量 cosine 应为 0', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it('方向接近的向量 cosine 应较高', () => {
    const score = cosineSimilarity([1, 0, 0], [0.9, 0.1, 0]);
    expect(score).toBeGreaterThan(0.9);
  });

  it('topKByEmbedding 应返回分数最高的 id', () => {
    const query = [1, 0, 0];
    const ids = topKByEmbedding(
      query,
      [
        { id: 1, embedding: [0.1, 0.9, 0] },
        { id: 2, embedding: [0.95, 0.05, 0] },
        { id: 3, embedding: [0.8, 0.2, 0] },
      ],
      2,
    );

    expect(ids).toEqual([2, 3]);
  });

  it('k <= 0 或空列表应返回 []', () => {
    expect(topKByEmbedding([1, 0], [], 3)).toEqual([]);
    expect(topKByEmbedding([1, 0], [{ id: 1, embedding: [1, 0] }], 0)).toEqual(
      [],
    );
  });
});
