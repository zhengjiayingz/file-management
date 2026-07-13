import {
  mergePaperKnowledge,
  paperKnowledgeSchema,
  pickKnowledgeSchema,
} from './knowledge.schemas';

describe('knowledge.schemas', () => {
  it('paperKnowledgeSchema 接受完整 mock 论文卡片', () => {
    const result = paperKnowledgeSchema.safeParse({
      title: 'Attention Is All You Need',
      researchQuestion: '能否只用注意力机制做序列建模？',
      contributions: ['提出 Transformer'],
      methodology: {
        approach: 'Self-Attention',
        dataset: 'WMT 英德翻译',
        metrics: ['BLEU'],
      },
      keyFindings: [
        {
          claim: 'Transformer 在翻译任务上优于 RNN',
          evidence: 'Table 2',
          section: 'results',
        },
      ],
      definitions: [
        {
          term: 'Multi-Head Attention',
          definition: '…',
          section: 'method',
        },
      ],
      limitations: ['未在更大规模数据上验证'],
      futureWork: ['扩展到视觉任务'],
      keywords: ['Transformer', 'Attention'],
    });

    expect(result.success).toBe(true);
  });

  it('无 dataset 时 methodology.dataset 为 null，不编造', () => {
    const result = paperKnowledgeSchema.safeParse({
      title: 'A Paper',
      researchQuestion: null,
      contributions: [],
      methodology: {
        approach: 'CNN',
        dataset: null,
        metrics: [],
      },
      keyFindings: [],
      definitions: [],
      limitations: [],
      futureWork: [],
      keywords: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.methodology.dataset).toBeNull();
    }
  });

  it('pickKnowledgeSchema 仅 paper / lab_report 有定义', () => {
    expect(pickKnowledgeSchema('paper')).toBe(paperKnowledgeSchema);
    expect(typeof pickKnowledgeSchema('lab_report').safeParse).toBe('function');
  });

  it('mergePaperKnowledge 合并字段组 partial', () => {
    const merged = mergePaperKnowledge([
      {
        title: 'Test Paper',
        researchQuestion: 'Why?',
        contributions: ['C1'],
      },
      {
        methodology: {
          approach: 'RAG',
          dataset: null,
          metrics: ['F1'],
        },
      },
      {
        keyFindings: [
          { claim: 'Finding 1', evidence: null, section: 'results' },
        ],
      },
    ]);

    expect(merged.title).toBe('Test Paper');
    expect(merged.contributions).toEqual(['C1']);
    expect(merged.methodology.approach).toBe('RAG');
    expect(merged.methodology.dataset).toBeNull();
    expect(merged.keyFindings).toHaveLength(1);
    expect(merged.keyFindings[0]?.section).toBe('results');
  });
});
