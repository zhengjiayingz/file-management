import {
  chunkSummarySchema,
  narrativeBookSchema,
  instructionalBookSchema,
  academicBookSchema,
  paperBookSchema,
} from './summary.schemas';
import { pickBookSchema, SUMMARY_GENRES } from './summary-genre.types';

describe('summary.schemas', () => {
  it('chunkSummarySchema 接受合法对象', () => {
    const result = chunkSummarySchema.safeParse({
      summary: '主角踏上旅程。',
      keyPoints: ['遇见导师'],
    });
    expect(result.success).toBe(true);
  });

  it('chunkSummarySchema 缺少 summary 时使用默认值', () => {
    const result = chunkSummarySchema.safeParse({ keyPoints: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe('（暂无摘要）');
    }
  });

  it('chunkSummarySchema 兼容 null keyPoints', () => {
    const result = chunkSummarySchema.safeParse({
      summary: '片段摘要',
      keyPoints: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyPoints).toEqual([]);
    }
  });

  it('narrativeBookSchema 接受 novel 最小结构', () => {
    const result = narrativeBookSchema.safeParse({
      oneLiner: '一个少年的成长故事',
      overview: '……',
      plotPoints: ['开端', '高潮'],
      characters: [{ name: '张三', role: '主角' }],
    });
    expect(result.success).toBe(true);
  });

  it('6 个体裁 pickBookSchema 均可返回 schema', () => {
    for (const genre of SUMMARY_GENRES) {
      const schema = pickBookSchema(genre);
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    }
  });

  it('instructional / academic / paper schema 基本校验', () => {
    expect(
      instructionalBookSchema.safeParse({
        purpose: '教学',
        overview: '概览',
        sections: [],
        keyPoints: [],
      }).success,
    ).toBe(true);

    expect(
      academicBookSchema.safeParse({
        researchQuestion: 'Q',
        method: 'M',
        keyFindings: [],
        conclusions: [],
      }).success,
    ).toBe(true);

    expect(
      paperBookSchema.safeParse({
        researchQuestion: 'Q',
        method: 'M',
        keyFindings: [],
        conclusions: [],
        contributions: ['C1'],
      }).success,
    ).toBe(true);
  });
});
