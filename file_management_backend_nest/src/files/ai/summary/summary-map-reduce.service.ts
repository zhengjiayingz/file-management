import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { generateStructuredObject } from '@/files/ai/utils/structured-object.util';
import type { SummaryGenreValue } from './summary-genre.types';
import { pickBookSchema } from './summary-genre.types';
import { chunkSummarySchema, type ChunkSummary } from './summary.schemas';
import {
  buildBookPrompt,
  buildChapterPrompt,
  buildChunkPrompt,
} from './summary.prompt';

/** 短文：跳过 chapter Reduce */
const SHORT_DOC_MAX_CHUNKS = 3;

type SummaryPayload = Prisma.InputJsonValue;
type PersistedSummaryType = 'chunk' | 'chapter' | 'book';

export type SummaryChunkInput = {
  chunkIndex: number;
  chapterNo: number | null;
  content: string;
};

type PersistedSummary = {
  refKey: string;
  payload: SummaryPayload;
};

@Injectable()
export class SummaryMapReduceService {
  constructor(private readonly prisma: PrismaService) {}

  async persistSummary(
    userFileId: number,
    type: PersistedSummaryType,
    refKey: string,
    payload: SummaryPayload,
  ): Promise<void> {
    await this.prisma.documentSummary.upsert({
      where: {
        userFileId_type_refKey: { userFileId, type, refKey },
      },
      create: { userFileId, type, refKey, payload },
      update: { payload },
    });
  }
  // chunk总结生成
  private async generateChunkSummary(
    genre: SummaryGenreValue,
    content: string,
  ): Promise<ChunkSummary> {
    //调用大模型
    const object = await generateStructuredObject({
      schema: chunkSummarySchema,
      prompt: buildChunkPrompt(genre, content),
    });
    return object;
  }
  // 章节总结生成
  private async generateChapterSummary(
    genre: SummaryGenreValue,
    chapterNo: number,
    chunkPayloads: SummaryPayload[],
  ): Promise<ChunkSummary> {
    const object = await generateStructuredObject({
      schema: chunkSummarySchema,
      prompt: buildChapterPrompt(
        genre,
        chapterNo,
        JSON.stringify(chunkPayloads, null, 2),
      ),
    });
    return object;
  }

  // 整书总结生成
  private async generateBookSummary(
    genre: SummaryGenreValue,
    intermediatePayloads: SummaryPayload[],
  ): Promise<SummaryPayload> {
    const schema = pickBookSchema(genre);
    const object = await generateStructuredObject({
      schema,
      prompt: buildBookPrompt(
        genre,
        JSON.stringify(intermediatePayloads, null, 2),
      ),
    });
    return object as SummaryPayload;
  }

  /** 传入chunks 给每个chunks生成总结，并把每个chunk总结存入数据库*/
  async summarizeChunks(
    userFileId: number,
    genre: SummaryGenreValue,
    chunks: SummaryChunkInput[],
  ): Promise<PersistedSummary[]> {
    const results: PersistedSummary[] = [];
    // 生成 chunk 总结，并把每个chunk总结存入数据库
    for (const chunk of chunks) {
      const payload = await this.generateChunkSummary(genre, chunk.content);
      const refKey = `chunk:${chunk.chunkIndex}`;
      await this.persistSummary(userFileId, 'chunk', refKey, payload);
      results.push({ refKey, payload });
    }

    return results;
  }

  /** Reduce：同章 chunk 摘要 → type=chapter, refKey=chapter:{no} */
  //  把「同一章的多个块摘要」合并成「一条章节摘要」，存为 chapter:{章号}，供后续全书摘要使用
  async reduceChapters(
    userFileId: number,
    genre: SummaryGenreValue,
    chunks: SummaryChunkInput[],
    chunkSummaries: PersistedSummary[],
  ): Promise<PersistedSummary[]> {
    const byChapter = new Map<number, SummaryPayload[]>(); // 把每个chunk总结按章节分组

    for (const chunk of chunks) {
      if (chunk.chapterNo == null) continue;
      const refKey = `chunk:${chunk.chunkIndex}`;
      const found = chunkSummaries.find((s) => s.refKey === refKey);
      if (!found) continue;
      const list = byChapter.get(chunk.chapterNo) ?? [];
      list.push(found.payload);
      byChapter.set(chunk.chapterNo, list);
    }

    const results: PersistedSummary[] = [];
    // payloads是一章所有chunk摘要的数组
    for (const [chapterNo, payloads] of [...byChapter.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      // 把这一章所有的块摘要交给 AI，合并成一条章节摘要
      const payload = await this.generateChapterSummary(
        genre,
        chapterNo,
        payloads,
      );
      const refKey = `chapter:${chapterNo}`;
      await this.persistSummary(userFileId, 'chapter', refKey, payload); // 把某一章的章节总结存入数据库
      results.push({ refKey, payload }); // 把这一章的章节总结存入结果数组
    }
    // 返回章节总结数组
    return results;
  }

  /** Reduce：全书 → type=book, refKey=book */
  async reduceBook(
    userFileId: number,
    genre: SummaryGenreValue,
    intermediateSummaries: PersistedSummary[],
  ): Promise<PersistedSummary> {
    // 调用 AI，按体裁选 schema，合并成全书结构化摘要
    const payload = await this.generateBookSummary(
      genre,
      intermediateSummaries.map((s) => s.payload), // 只取出摘要内容，去掉 refKey 等元数据
    );
    const refKey = 'book'; // 固定键名，每个文件只有一条全书摘要
    await this.persistSummary(userFileId, 'book', refKey, payload); // 把全书总结存入数据库
    return { refKey, payload }; // 返回全书总结
  }

  /**
   * 一站式入口（单测 / 阶段 3 Worker 都调这个）
   * 顺序：Map → (可选) chapter Reduce → book Reduce
   */
  async runMapReduce(
    userFileId: number,
    genre: SummaryGenreValue,
    chunks: SummaryChunkInput[],
  ): Promise<void> {
    const chunkSummaries = await this.summarizeChunks(
      userFileId,
      genre,
      chunks,
    );

    const hasChapter = chunks.some((c) => c.chapterNo != null);
    const skipChapter = !hasChapter || chunks.length <= SHORT_DOC_MAX_CHUNKS;

    const intermediates = skipChapter
      ? chunkSummaries
      : await this.reduceChapters(userFileId, genre, chunks, chunkSummaries);

    await this.reduceBook(userFileId, genre, intermediates);
  }
}
