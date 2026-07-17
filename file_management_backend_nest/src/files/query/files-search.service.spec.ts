import { BadRequestException } from '@nestjs/common';

jest.mock('@/files/ai/embedding/embedding.provider', () => ({
  embedOne: jest.fn().mockResolvedValue([1, 0, 0]),
}));

import {
  aggregateMaxScoreByFile,
  FilesSearchService,
  parseSemanticSearchQuery,
} from './files-search.service';
import { embedOne } from '@/files/ai/embedding/embedding.provider';

describe('parseSemanticSearchQuery', () => {
  it('拒绝空 q', () => {
    expect(() => parseSemanticSearchQuery({})).toThrow(BadRequestException);
    expect(() => parseSemanticSearchQuery({ q: '   ' })).toThrow(
      BadRequestException,
    );
  });

  it('合法 q + 默认 limit', () => {
    expect(parseSemanticSearchQuery({ q: ' Nest 迁移 ' })).toEqual({
      q: 'Nest 迁移',
      limit: 20,
    });
  });

  it('limit 上限截到 50', () => {
    expect(parseSemanticSearchQuery({ q: 'x', limit: '99' }).limit).toBe(50);
  });
});

describe('aggregateMaxScoreByFile', () => {
  it('同一文件取 max(score)，并保留对应 excerpt', () => {
    const ranked = aggregateMaxScoreByFile([
      {
        chunkId: 1,
        userFileId: 10,
        chunkIndex: 0,
        content: '低分块',
        score: 0.2,
      },
      {
        chunkId: 2,
        userFileId: 10,
        chunkIndex: 1,
        content: '高分块正文',
        score: 0.9,
      },
      {
        chunkId: 3,
        userFileId: 20,
        chunkIndex: 0,
        content: '另一文件',
        score: 0.5,
      },
    ]);

    expect(ranked.map((r) => r.userFileId)).toEqual([10, 20]);
    expect(ranked[0]).toMatchObject({
      userFileId: 10,
      score: 0.9,
      chunkIndex: 1,
      excerpt: '高分块正文',
    });
  });
});

describe('FilesSearchService.semanticSearch', () => {
  const prisma = {
    documentIndexJob: { findMany: jest.fn() },
    documentChunk: { findMany: jest.fn() },
    userFile: { findMany: jest.fn() },
  };
  const service = new FilesSearchService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    (embedOne as jest.Mock).mockResolvedValue([1, 0, 0]);
  });

  it('无 ready 索引时返回空列表且 indexedFileCount=0', async () => {
    prisma.documentIndexJob.findMany.mockResolvedValue([]);

    const result = await service.semanticSearch(1, { q: '测试' });

    expect(result).toEqual({
      items: [],
      indexedFileCount: 0,
      q: '测试',
    });
    expect(prisma.documentChunk.findMany).not.toHaveBeenCalled();
    expect(embedOne).not.toHaveBeenCalled();
  });

  it('有索引时按相关度返回文件并带 excerpt', async () => {
    prisma.documentIndexJob.findMany.mockResolvedValue([
      { userFileId: 10 },
      { userFileId: 20 },
    ]);
    prisma.documentChunk.findMany.mockResolvedValue([
      {
        id: 1,
        userFileId: 10,
        chunkIndex: 0,
        content: '关于 Nest 迁移的笔记',
        embedding: [1, 0, 0],
      },
      {
        id: 2,
        userFileId: 20,
        chunkIndex: 0,
        content: '无关内容',
        embedding: [0, 1, 0],
      },
    ]);
    prisma.userFile.findMany.mockResolvedValue([
      {
        id: 10,
        fileName: 'nest.md',
        fileType: 'md',
        parentId: null,
        storage: { mimeType: 'text/markdown', fileSize: 100n },
      },
      {
        id: 20,
        fileName: 'other.md',
        fileType: 'md',
        parentId: null,
        storage: { mimeType: 'text/markdown', fileSize: 50n },
      },
    ]);

    const result = await service.semanticSearch(1, { q: 'Nest', limit: 10 });

    expect(result.indexedFileCount).toBe(2);
    expect(result.items[0].id).toBe(10);
    expect(result.items[0].excerpt).toContain('Nest');
    expect(result.items.map((i) => i.id)).toEqual([10, 20]);
  });
});
