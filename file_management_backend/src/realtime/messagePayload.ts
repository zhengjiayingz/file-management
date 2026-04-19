import prisma from '../lib/prisma.js';

/** 与聊天记录接口一致，供 WebSocket 推送 */
export async function loadMessageForEmit(messageId: number) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      file: {
        select: { id: true, fileName: true, fileType: true },
      },
    },
  });
}
