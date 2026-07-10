import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentSummaryType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type GetSummaryQuery = {
  type?: DocumentSummaryType;
  chapterNo?: number;
};

export type DocumentSummaryResponse = {
  success: true;
  data: {
    type: DocumentSummaryType;
    refKey: string;
    summaryGenre: string | null;
    payload: unknown;
  };
};

function resolveRefKey(query: GetSummaryQuery): {
  type: DocumentSummaryType;
  refKey: string;
} {
  const type = query.type ?? 'book';
  if (type === 'book') {
    return { type, refKey: 'book' };
  }
  if (type === 'chapter') {
    if (query.chapterNo == null || !Number.isFinite(query.chapterNo)) {
      throw new NotFoundException('chapter 摘要需要 chapterNo 参数');
    }
    return { type, refKey: `chapter:${query.chapterNo}` };
  }
  throw new NotFoundException('暂不支持该摘要类型');
}

@Injectable()
export class FilesAiSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    userId: number,
    fileId: number,
    query: GetSummaryQuery,
  ): Promise<DocumentSummaryResponse> {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!userFile) {
      throw new NotFoundException('文件不存在');
    }

    const job = await this.prisma.documentIndexJob.findUnique({
      where: { userFileId: fileId },
      select: { status: true, summaryGenre: true },
    });
    if (!job || job.status !== 'ready') {
      throw new ConflictException('文档索引未完成，暂无摘要');
    }

    const { type, refKey } = resolveRefKey(query);
    const row = await this.prisma.documentSummary.findUnique({
      where: {
        userFileId_type_refKey: { userFileId: fileId, type, refKey },
      },
      select: { type: true, refKey: true, payload: true },
    });
    if (!row) {
      throw new NotFoundException('摘要不存在');
    }

    return {
      success: true,
      data: {
        type: row.type,
        refKey: row.refKey,
        summaryGenre: job.summaryGenre,
        payload: row.payload,
      },
    };
  }
}
