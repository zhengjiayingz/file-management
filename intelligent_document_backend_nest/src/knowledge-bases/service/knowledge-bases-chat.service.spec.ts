import { BadRequestException } from '@nestjs/common';

jest.mock('ai', () => ({
  streamText: jest.fn(),
}));

jest.mock('@/files/ai/index/provider/embedding.provider', () => ({
  embedOne: jest.fn().mockResolvedValue([1, 0, 0]),
}));

jest.mock('@/files/ai/index/utils/similarity.util', () => ({
  topKByEmbedding: jest
    .fn()
    .mockImplementation((_q, items: { id: number }[]) =>
      items.map((i) => i.id),
    ),
}));

jest.mock('@/files/ai/chat/provider/chat-model.provider', () => ({
  getChatModel: jest.fn(),
}));

import { KnowledgeBasesChatService } from './knowledge-bases-chat.service';
import { KnowledgeBasesService } from './knowledge-bases.service';
import { KnowledgeBasesSessionService } from './knowledge-bases-session.service';
import { embedOne } from '@/files/ai/index/provider/embedding.provider';
import { topKByEmbedding } from '@/files/ai/index/utils/similarity.util';

describe('KnowledgeBasesChatService retrieve scope', () => {
  const prisma = {
    documentChunk: {
      findMany: jest.fn(),
    },
  };

  const knowledgeBases = {} as KnowledgeBasesService;
  const sessions = {} as KnowledgeBasesSessionService;
  const service = new KnowledgeBasesChatService(
    prisma as never,
    knowledgeBases,
    sessions,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (embedOne as jest.Mock).mockResolvedValue([1, 0, 0]);
    (topKByEmbedding as jest.Mock).mockImplementation(
      (_q: number[], items: { id: number }[]) => items.map((i) => i.id),
    );
  });

  it('检索只查知识库内 fileIds（IN scope）', async () => {
    const fileIds = [2218, 2534];
    const nameByFileId = new Map([
      [2218, 'ch1.pdf'],
      [2534, 'ch2.pdf'],
    ]);

    prisma.documentChunk.findMany.mockResolvedValue([
      {
        id: 101,
        userFileId: 2218,
        chunkIndex: 0,
        content: 'Harry lives under the stairs',
        embedding: [1, 0, 0],
      },
      {
        id: 202,
        userFileId: 2534,
        chunkIndex: 1,
        content: 'Nearly ten years had passed',
        embedding: [0.9, 0.1, 0],
      },
    ]);

    const chunks = await (
      service as unknown as {
        retrieveTopChunks: (
          fileIds: number[],
          nameByFileId: Map<number, string>,
          question: string,
        ) => Promise<
          Array<{
            id: number;
            userFileId: number;
            fileName: string;
            chunkIndex: number;
            content: string;
          }>
        >;
      }
    ).retrieveTopChunks(fileIds, nameByFileId, '哈利住在哪里');

    expect(prisma.documentChunk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userFileId: { in: fileIds } },
      }),
    );
    expect(chunks.every((c) => fileIds.includes(c.userFileId))).toBe(true);
    expect(chunks.map((c) => c.fileName).sort()).toEqual([
      'ch1.pdf',
      'ch2.pdf',
    ]);
  });

  it('无可用向量时抛 BadRequestException', async () => {
    prisma.documentChunk.findMany.mockResolvedValue([
      {
        id: 1,
        userFileId: 2218,
        chunkIndex: 0,
        content: 'x',
        embedding: null,
      },
    ]);

    await expect(
      (
        service as unknown as {
          retrieveTopChunks: (
            fileIds: number[],
            nameByFileId: Map<number, string>,
            question: string,
          ) => Promise<unknown>;
        }
      ).retrieveTopChunks([2218], new Map([[2218, 'a.pdf']]), 'q'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
