import { embedOne } from '@/files/ai/index/provider/embedding.provider';
import { generateStructuredObject } from '@/files/ai/chat/utils/structured-object.util';
import type { PaperKnowledge } from '@/files/ai/knowledge/types/knowledge.schemas';
import { KnowledgeExtractService } from '@/files/ai/knowledge/service/knowledge-extract.service';

jest.mock('@/files/ai/index/provider/embedding.provider', () => ({
  embedOne: jest.fn(),
}));

jest.mock('@/files/ai/chat/utils/structured-object.util', () => ({
  generateStructuredObject: jest.fn(),
}));

const embedOneMock = embedOne as jest.MockedFunction<typeof embedOne>;
const generateStructuredObjectMock =
  generateStructuredObject as jest.MockedFunction<
    typeof generateStructuredObject
  >;

type KnowledgeUpsertArg = {
  where: { userFileId: number };
  create: { userFileId: number; payload: PaperKnowledge };
  update: { payload: PaperKnowledge };
};

describe('KnowledgeExtractService', () => {
  const findMany = jest.fn();
  const upsert = jest
    .fn<Promise<unknown>, [KnowledgeUpsertArg]>()
    .mockResolvedValue(undefined);
  const prisma = {
    documentChunk: { findMany },
    documentKnowledge: { upsert },
  } as never;

  const service = new KnowledgeExtractService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    embedOneMock.mockResolvedValue([1, 0, 0]);
    findMany.mockResolvedValue([
      {
        id: 1,
        chunkIndex: 0,
        content: 'Abstract contributions methodology results',
        embedding: [1, 0, 0],
      },
      {
        id: 2,
        chunkIndex: 1,
        content: 'Limitations future work keywords',
        embedding: [0.9, 0.1, 0],
      },
    ]);

    generateStructuredObjectMock.mockImplementation(({ schemaName }) => {
      switch (schemaName) {
        case 'title':
          return Promise.resolve({ title: 'Mock Paper Title' });
        case 'contributions':
          return Promise.resolve({
            researchQuestion: 'How to mock?',
            contributions: ['C1'],
          });
        case 'methodology':
          return Promise.resolve({
            methodology: {
              approach: 'Approach X',
              dataset: null,
              metrics: ['Acc'],
            },
          });
        case 'findings':
          return Promise.resolve({
            keyFindings: [
              {
                claim: 'Finding A',
                evidence: null,
                section: 'results',
              },
            ],
          });
        case 'definitions':
          return Promise.resolve({ definitions: [] });
        case 'meta':
          return Promise.resolve({
            limitations: ['L1'],
            futureWork: [],
            keywords: ['k1'],
          });
        default:
          return Promise.resolve({});
      }
    });
  });

  it('novel 体裁应直接跳过（不查 chunk、不写库）', async () => {
    await service.extractKnowledge(10, 'novel');

    expect(findMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(generateStructuredObjectMock).not.toHaveBeenCalled();
  });

  it('无可用 chunk 应抛错', async () => {
    findMany.mockResolvedValueOnce([]);

    await expect(service.extractKnowledge(10, 'paper')).rejects.toThrow(
      /无可用 chunk/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lab_report 应明确提示尚未实现', async () => {
    await expect(service.extractKnowledge(10, 'lab_report')).rejects.toThrow(
      /lab_report 知识卡片抽取尚未实现/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('paper 应分 6 组字段抽取并 merge 入库，dataset 可为 null', async () => {
    await service.extractKnowledge(42, 'paper');

    expect(generateStructuredObjectMock).toHaveBeenCalledTimes(6);
    expect(embedOneMock).toHaveBeenCalledTimes(6);
    expect(upsert).toHaveBeenCalledTimes(1);

    const upsertArg = upsert.mock.calls[0]?.[0];
    expect(upsertArg).toBeDefined();
    if (!upsertArg) {
      throw new Error('expected upsert to be called with an argument');
    }
    expect(upsertArg.where).toEqual({ userFileId: 42 });
    expect(upsertArg.create.userFileId).toBe(42);
    expect(upsertArg.create.payload).toMatchObject({
      title: 'Mock Paper Title',
      contributions: ['C1'],
      methodology: {
        approach: 'Approach X',
        dataset: null,
        metrics: ['Acc'],
      },
      keyFindings: [
        {
          claim: 'Finding A',
          section: 'results',
        },
      ],
    });
  });
});
