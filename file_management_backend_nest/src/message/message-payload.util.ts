import { PrismaService } from '@/prisma/prisma.service';

/** 与聊天记录接口一致，供 WebSocket 推送（S9） */
export async function loadMessageForEmit(
  prisma: PrismaService,
  messageId: number,
) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      file: {
        select: { id: true, fileName: true, fileType: true },
      },
    },
  });
}
