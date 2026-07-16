import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

/** 知识库归属校验（供多个 service 复用） */
@Injectable()
export class KnowledgeBasesAccessHelper {
  constructor(private readonly prisma: PrismaService) {}

  /** 校验知识库归属当前用户；不存在或不属于自己则 404 */
  async requireOwned(userId: number, knowledgeBaseId: number) {
    const row = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, userId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('知识库不存在');
    }
    return row;
  }
}
