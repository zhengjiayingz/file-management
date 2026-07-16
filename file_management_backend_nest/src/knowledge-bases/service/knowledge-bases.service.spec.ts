import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { KnowledgeBasesAccessHelper } from '../helpers/knowledge-bases-access.helper';
import { KnowledgeBasesService } from './knowledge-bases.service';

describe('KnowledgeBasesService', () => {
  const prisma = {
    knowledgeBaseItem: {
      findMany: jest.fn(),
    },
    documentIndexJob: {
      findMany: jest.fn(),
    },
  };

  const requireOwned = jest.fn().mockResolvedValue({ id: 1 });
  const access = {
    requireOwned,
  } as unknown as KnowledgeBasesAccessHelper;

  const service = new KnowledgeBasesService(prisma as never, access);

  beforeEach(() => {
    jest.clearAllMocks();
    requireOwned.mockResolvedValue({ id: 1 });
  });

  describe('getIndexStatus', () => {
    it('空库：total=0 且 canAsk=false', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([]);

      const status = await service.getIndexStatus(7, 1);

      expect(requireOwned).toHaveBeenCalledWith(7, 1);
      expect(status).toEqual({
        total: 0,
        readyCount: 0,
        canAsk: false,
        files: [],
        notReadyFiles: [],
      });
      expect(prisma.documentIndexJob.findMany).not.toHaveBeenCalled();
    });

    it('有未 ready 文件时 canAsk=false', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([
        {
          userFileId: 10,
          userFile: { id: 10, fileName: 'a.pdf' },
        },
        {
          userFileId: 11,
          userFile: { id: 11, fileName: 'b.pdf' },
        },
      ]);
      prisma.documentIndexJob.findMany.mockResolvedValue([
        { userFileId: 10, status: 'ready' },
        { userFileId: 11, status: 'embedding' },
      ]);

      const status = await service.getIndexStatus(7, 1);

      expect(status.total).toBe(2);
      expect(status.readyCount).toBe(1);
      expect(status.canAsk).toBe(false);
      expect(status.notReadyFiles).toEqual([
        { userFileId: 11, fileName: 'b.pdf', indexStatus: 'embedding' },
      ]);
    });

    it('全员 ready 时 canAsk=true', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([
        {
          userFileId: 10,
          userFile: { id: 10, fileName: 'a.pdf' },
        },
      ]);
      prisma.documentIndexJob.findMany.mockResolvedValue([
        { userFileId: 10, status: 'ready' },
      ]);

      const status = await service.getIndexStatus(7, 1);

      expect(status.canAsk).toBe(true);
      expect(status.readyCount).toBe(1);
      expect(status.notReadyFiles).toEqual([]);
    });

    it('无 job 视为未就绪', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([
        {
          userFileId: 10,
          userFile: { id: 10, fileName: 'a.pdf' },
        },
      ]);
      prisma.documentIndexJob.findMany.mockResolvedValue([]);

      const status = await service.getIndexStatus(7, 1);

      expect(status.canAsk).toBe(false);
      expect(status.files[0]).toMatchObject({
        userFileId: 10,
        indexStatus: null,
        ready: false,
      });
    });
  });

  describe('assertReadyForChat', () => {
    it('空库抛 BadRequestException', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([]);

      await expect(service.assertReadyForChat(7, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('未全员 ready 抛 ConflictException（409）', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([
        {
          userFileId: 10,
          userFile: { id: 10, fileName: 'pending.pdf' },
        },
      ]);
      prisma.documentIndexJob.findMany.mockResolvedValue([
        { userFileId: 10, status: 'pending' },
      ]);

      await expect(service.assertReadyForChat(7, 1)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('全员 ready 时返回 status', async () => {
      prisma.knowledgeBaseItem.findMany.mockResolvedValue([
        {
          userFileId: 10,
          userFile: { id: 10, fileName: 'ok.pdf' },
        },
      ]);
      prisma.documentIndexJob.findMany.mockResolvedValue([
        { userFileId: 10, status: 'ready' },
      ]);

      const status = await service.assertReadyForChat(7, 1);
      expect(status.canAsk).toBe(true);
    });
  });

  describe('归属', () => {
    it('非本人库由 access 抛 NotFound', async () => {
      requireOwned.mockRejectedValue(new NotFoundException('知识库不存在'));

      await expect(service.getIndexStatus(7, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
