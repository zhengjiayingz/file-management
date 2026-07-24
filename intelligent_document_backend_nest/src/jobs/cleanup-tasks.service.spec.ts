import { Test, TestingModule } from '@nestjs/testing';
import { CleanupTasksService } from './cleanup-tasks.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('CleanupTasksService', () => {
  let service: CleanupTasksService;
  const prisma = {
    fileStorage: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    fileShare: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupTasksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CleanupTasksService);
  });

  it('runCleanupOnce 无待删文件时应返回 0', async () => {
    prisma.fileStorage.findMany.mockResolvedValue([]);
    prisma.fileShare.findMany.mockResolvedValue([]);

    const result = await service.runCleanupOnce();

    expect(result).toEqual({ filesDeleted: 0, sharesDeleted: 0, fileFailures: 0 });
  });

  it('runCleanupOnce 应删除 pending_delete 物理文件与 file_storage 行', async () => {
    prisma.fileStorage.findMany.mockResolvedValue([
      { id: 1, filePath: 'uploads/gone.txt' },
    ]);
    prisma.fileStorage.delete.mockResolvedValue({});
    prisma.fileShare.findMany.mockResolvedValue([]);

    const result = await service.runCleanupOnce();

    expect(result.filesDeleted).toBe(1);
    expect(prisma.fileStorage.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('runCleanupOnce 应批量删除过期分享', async () => {
    prisma.fileStorage.findMany.mockResolvedValue([]);
    prisma.fileShare.findMany
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }])
      .mockResolvedValueOnce([]);
    prisma.fileShare.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.runCleanupOnce();

    expect(result.sharesDeleted).toBe(2);
    expect(prisma.fileShare.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] } },
    });
  });
});
