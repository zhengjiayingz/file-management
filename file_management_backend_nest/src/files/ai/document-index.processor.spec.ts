jest.mock('./summary/summary-map-reduce.service', () => ({
  SummaryMapReduceService: class MockSummaryMapReduceService {
    runMapReduce = jest.fn().mockResolvedValue(undefined);
  },
}));

jest.mock('./knowledge/knowledge-extract.service', () => ({
  KnowledgeExtractService: class MockKnowledgeExtractService {
    extractKnowledge = jest.fn().mockResolvedValue(undefined);
  },
}));

jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: '   ' }));

jest.mock('./embedding/embedding.provider', () => ({
  embedMany: jest.fn(),
}));

jest.mock('./chunk/text-chunker', () => ({
  chunkText: jest.fn(),
}));

import { Readable } from 'node:stream';
import { Job } from 'bullmq';
import { DocumentIndexProcessor } from './document-index.processor';
import {
  DOCUMENT_INDEX_JOB_NAME,
  type DocumentIndexJobData,
} from './document-index-queue.types';

type DocumentIndexJobUpdateArgs = {
  where: { userFileId: number };
  data: {
    status?: string;
    progressMsg?: string;
    errorMessage?: string | null;
    progress?: number;
    chunkCount?: number;
    indexedFileHash?: string | null;
  };
};

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);

function createProcessor() {
  const jobUpdate = jest
    .fn<Promise<void>, [DocumentIndexJobUpdateArgs]>()
    .mockResolvedValue(undefined);
  const findFirst = jest.fn();
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const chunkUpdate = jest.fn().mockResolvedValue(undefined);
  const chunkFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    userFile: { findFirst },
    documentIndexJob: { update: jobUpdate },
    documentChunk: {
      deleteMany,
      createMany,
      update: chunkUpdate,
      findMany: chunkFindMany,
    },
  };

  const getReadStream = jest
    .fn()
    .mockResolvedValue(Readable.from([MINIMAL_PDF]));
  const exists = jest.fn().mockResolvedValue(true);
  const storageService = {
    getStorageProvider: () => ({ exists, getReadStream }),
  };

  const summaryMapReduce = {
    runMapReduce: jest.fn().mockResolvedValue(undefined),
  };

  const knowledgeExtract = {
    extractKnowledge: jest.fn().mockResolvedValue(undefined),
  };

  const processor = new DocumentIndexProcessor(
    prisma as never,
    storageService as never,
    summaryMapReduce as never,
    knowledgeExtract as never,
  );

  return {
    processor,
    prisma: { findFirst, jobUpdate, deleteMany, createMany, chunkFindMany },
    summaryMapReduce,
  };
}

function createJob(data: DocumentIndexJobData): Job<DocumentIndexJobData> {
  return {
    name: DOCUMENT_INDEX_JOB_NAME,
    data,
  } as Job<DocumentIndexJobData>;
}

describe('DocumentIndexProcessor', () => {
  const jobData: DocumentIndexJobData = {
    userFileId: 2218,
    userId: 42,
    mode: 'general',
    summaryGenre: 'novel',
  };

  it('无文字层 PDF 应标记 failed 并返回扫描件友好错误', async () => {
    const { processor, prisma } = createProcessor();
    prisma.findFirst.mockResolvedValue({
      fileName: 'scan.pdf',
      storage: {
        filePath: 'uploads/scan.pdf',
        mimeType: 'application/pdf',
        fileHash: 'pdf-hash',
      },
    });

    const job = createJob(jobData);

    await expect(processor.process(job)).rejects.toThrow(
      /未检测到可选中文字|扫描件/,
    );

    expect(prisma.jobUpdate).toHaveBeenCalled();
    const lastCall = prisma.jobUpdate.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const updateCall = lastCall![0];

    expect(updateCall.where).toEqual({ userFileId: jobData.userFileId });
    expect(updateCall.data.status).toBe('failed');
    expect(updateCall.data.progressMsg).toBe('索引失败');
    expect(updateCall.data.errorMessage).toMatch(/未检测到可选中文字|扫描件/);
  });
});
