import { NotFoundException } from '@nestjs/common';
import {
  FILE_AI_CHAT_MAX_MESSAGES,
  FilesAiChatSessionService,
} from './files-ai-chat-session.service';

describe('FilesAiChatSessionService', () => {
  const prisma = {
    userFile: { findFirst: jest.fn() },
    fileAiChatSession: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    fileAiChatMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const service = new FilesAiChatSessionService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parseMode rejects invalid', () => {
    expect(() => service.parseMode('foo')).toThrow('无效的对话模式');
  });

  it('getOrCreateSession 404 when file missing', async () => {
    prisma.userFile.findFirst.mockResolvedValue(null);
    await expect(service.getOrCreateSession(1, 9, 'selection')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getOrCreateSession returns messages', async () => {
    prisma.userFile.findFirst.mockResolvedValue({ id: 9 });
    prisma.fileAiChatSession.upsert.mockResolvedValue({
      id: 3,
      mode: 'selection',
    });
    const createdAt = new Date('2026-07-19T00:00:00.000Z');
    prisma.fileAiChatMessage.findMany.mockResolvedValue([
      {
        id: 1,
        role: 'user',
        content: 'hi',
        meta: null,
        createdAt,
      },
    ]);

    const res = await service.getOrCreateSession(1, 9, 'selection');
    expect(res.data.sessionId).toBe(3);
    expect(res.data.messages).toHaveLength(1);
    expect(res.data.messages[0].content).toBe('hi');
    expect(prisma.fileAiChatSession.upsert).toHaveBeenCalled();
  });

  it('appendMessage trims when over limit', async () => {
    prisma.userFile.findFirst.mockResolvedValue({ id: 9 });
    prisma.fileAiChatSession.upsert.mockResolvedValue({
      id: 3,
      mode: 'rag',
    });
    prisma.fileAiChatMessage.create.mockResolvedValue({
      id: 10,
      role: 'assistant',
      content: 'ans',
      meta: null,
      createdAt: new Date(),
    });
    prisma.fileAiChatSession.update.mockResolvedValue({});
    prisma.fileAiChatMessage.count.mockResolvedValue(FILE_AI_CHAT_MAX_MESSAGES + 2);
    prisma.fileAiChatMessage.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.fileAiChatMessage.deleteMany.mockResolvedValue({ count: 2 });

    await service.appendMessage(1, 9, 'rag', {
      role: 'assistant',
      content: 'ans',
    });

    expect(prisma.fileAiChatMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
    });
  });

  it('clearSession deletes messages when session exists', async () => {
    prisma.userFile.findFirst.mockResolvedValue({ id: 9 });
    prisma.fileAiChatSession.findUnique.mockResolvedValue({ id: 3 });
    prisma.fileAiChatMessage.deleteMany.mockResolvedValue({ count: 4 });
    prisma.fileAiChatSession.update.mockResolvedValue({});

    const res = await service.clearSession(1, 9, 'solve');
    expect(res.data.cleared).toBe(4);
  });
});
