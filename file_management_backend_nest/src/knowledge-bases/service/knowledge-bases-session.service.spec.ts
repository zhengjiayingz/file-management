import { NotFoundException } from '@nestjs/common';
import { KnowledgeBasesAccessHelper } from '../helpers/knowledge-bases-access.helper';
import { KnowledgeBasesSessionService } from './knowledge-bases-session.service';

describe('KnowledgeBasesSessionService', () => {
  const prisma = {
    knowledgeBaseSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    knowledgeBaseMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const requireOwned = jest.fn().mockResolvedValue({ id: 1 });
  const access = {
    requireOwned,
  } as unknown as KnowledgeBasesAccessHelper;

  const service = new KnowledgeBasesSessionService(prisma as never, access);

  beforeEach(() => {
    jest.clearAllMocks();
    requireOwned.mockResolvedValue({ id: 1 });
  });

  describe('listSessions', () => {
    it('仅查询该库会话并倒序', async () => {
      prisma.knowledgeBaseSession.findMany.mockResolvedValue([
        { id: 2, title: 'b', createdAt: new Date(), updatedAt: new Date() },
      ]);

      const rows = await service.listSessions(7, 1);

      expect(requireOwned).toHaveBeenCalledWith(7, 1);
      expect(prisma.knowledgeBaseSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { knowledgeBaseId: 1 },
          orderBy: { updatedAt: 'desc' },
        }),
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('removeSession', () => {
    it('校验归属后删除会话', async () => {
      prisma.knowledgeBaseSession.findFirst.mockResolvedValue({
        id: 5,
        knowledgeBaseId: 1,
      });
      prisma.knowledgeBaseSession.delete.mockResolvedValue({ id: 5 });

      const result = await service.removeSession(7, 1, 5);

      expect(prisma.knowledgeBaseSession.findFirst).toHaveBeenCalledWith({
        where: { id: 5, knowledgeBaseId: 1 },
      });
      expect(prisma.knowledgeBaseSession.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
      expect(result).toEqual({ success: true, message: '已删除' });
    });

    it('会话不存在时 404', async () => {
      prisma.knowledgeBaseSession.findFirst.mockResolvedValue(null);

      await expect(service.removeSession(7, 1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.knowledgeBaseSession.delete).not.toHaveBeenCalled();
    });
  });

  describe('resolveSession', () => {
    it('无 sessionId 时创建新会话', async () => {
      prisma.knowledgeBaseSession.create.mockResolvedValue({
        id: 9,
        knowledgeBaseId: 1,
        title: '哈利住在哪里',
      });

      const session = await service.resolveSession(
        7,
        1,
        undefined,
        '哈利住在哪里',
      );

      expect(prisma.knowledgeBaseSession.create).toHaveBeenCalledWith({
        data: { knowledgeBaseId: 1, title: '哈利住在哪里' },
      });
      expect(session.id).toBe(9);
    });
  });
});
