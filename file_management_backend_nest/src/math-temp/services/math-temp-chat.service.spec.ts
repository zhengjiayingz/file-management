import { BadRequestException, GoneException } from '@nestjs/common';
import { MathTempChatService } from './math-temp-chat.service';
import type { MathTempImagesService } from './math-temp-images.service';

describe('MathTempChatService', () => {
  const prisma = {
    tempAiChatSession: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tempAiChatMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const tempImages = {
    requireUsable: jest.fn(),
  };

  const service = new MathTempChatService(
    prisma as never,
    tempImages as unknown as MathTempImagesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getOrCreateSession rejects invalid mode', async () => {
    await expect(
      service.getOrCreateSession(1, 'tmp1', 'rag'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getOrCreateSession returns messages when temp usable', async () => {
    tempImages.requireUsable.mockResolvedValue({ id: 1 });
    prisma.tempAiChatSession.upsert.mockResolvedValue({
      id: 7,
      mode: 'solve',
    });
    const createdAt = new Date('2026-07-19T00:00:00.000Z');
    prisma.tempAiChatMessage.findMany.mockResolvedValue([
      {
        id: 1,
        role: 'user',
        content: '请解题',
        meta: null,
        createdAt,
      },
    ]);

    const res = await service.getOrCreateSession(1, 'tmp1', 'solve');
    expect(res.data.sessionId).toBe(7);
    expect(res.data.messages).toHaveLength(1);
    expect(tempImages.requireUsable).toHaveBeenCalledWith(1, 'tmp1');
  });

  it('getOrCreateSession propagates Gone when temp expired', async () => {
    tempImages.requireUsable.mockRejectedValue(new GoneException('已过期'));
    await expect(
      service.getOrCreateSession(1, 'tmp1', 'selection'),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('clearSession returns cleared 0 when no session', async () => {
    tempImages.requireUsable.mockResolvedValue({ id: 1 });
    prisma.tempAiChatSession.findUnique.mockResolvedValue(null);
    const res = await service.clearSession(1, 'tmp1', 'selection');
    expect(res.data.cleared).toBe(0);
  });
});
