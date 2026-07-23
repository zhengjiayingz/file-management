import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { SummaryGenreValue } from '@/files/ai/summary/types/summary-genre.types';

export type DocumentKnowledgeResponse = {
  success: true;
  data: {
    summaryGenre: SummaryGenreValue;
    payload: unknown;
  };
};

@Injectable()
export class FilesAiKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/files/:id/ai/knowledge — 读取已入库的学术知识卡片 */
  async getKnowledge(
    userId: number,
    fileId: number,
  ): Promise<DocumentKnowledgeResponse> {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!userFile) {
      throw new NotFoundException('文件不存在');
    }

    const job = await this.prisma.documentIndexJob.findUnique({
      where: { userFileId: fileId },
      select: { status: true, mode: true, summaryGenre: true },
    });
    if (!job || job.status !== 'ready') {
      throw new ConflictException('文档索引未完成，暂无知识卡片');
    }
    if (job.mode !== 'academic') {
      throw new ConflictException('仅学术体裁索引支持知识卡片');
    }
    if (!job.summaryGenre) {
      throw new ConflictException('缺少 summaryGenre，无法读取知识卡片');
    }

    const row = await this.prisma.documentKnowledge.findUnique({
      where: { userFileId: fileId },
      select: { payload: true },
    });
    if (!row) {
      throw new NotFoundException('知识卡片不存在');
    }

    return {
      success: true,
      data: {
        summaryGenre: job.summaryGenre,
        payload: row.payload,
      },
    };
  }
}
