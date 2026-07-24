// 文件语义搜索服务
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { embedOne } from '@/files/ai/index/provider/embedding.provider';
import { cosineSimilarity } from '@/files/ai/index/utils/similarity.util';

// 搜索词最长 500 字，防止超长请求
const MAX_QUERY_CHARS = 500;
// 默认返回 20个文件
const DEFAULT_LIMIT = 20;
// 最大返回 50 个文件
const MAX_LIMIT = 50;
// 结果里预览摘录最多 160 字
const EXCERPT_MAX = 160;

const MAX_INDEXED_FILES = 200;

const MIN_SCORE = 0.35; // 最低分，低于这个不返回

// 某一个「文档块」算完相似度之后的样子——属于哪个文件、第几块、正文、分数。
export type ChunkScoreInput = {
  chunkId: number;
  userFileId: number;
  chunkIndex: number;
  content: string;
  score: number;
};

// 按文件汇总后的结果——这个文件最终分数、用哪一块当代表、摘录文案。
// 语义搜要对用户返回「文件列表」，所以需要从「很多 chunk」聚合成「若干文件」。
export type AggregatedFileScore = {
  userFileId: number;
  score: number;
  chunkIndex: number;
  excerpt: string;
};

export type SemanticSearchItem = {
  id: number;
  fileName: string;
  fileType: string;
  mimeType: string | null;
  fileSize: number | null;
  parentId: number | null;
  score: number;
  excerpt: string;
  chunkIndex: number;
};
export type SemanticSearchResult = {
  items: SemanticSearchItem[];
  indexedFileCount: number;
  q: string;
};

/**  把前端传来的 query（q、limit）校验并整理成干净数据。*/
export function parseSemanticSearchQuery(query: Record<string, unknown>): {
  q: string;
  limit: number;
} {
  const raw = query.q;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new BadRequestException('请输入搜索内容');
  }
  const q = raw.trim().slice(0, MAX_QUERY_CHARS);

  let limit = DEFAULT_LIMIT;
  if (query.limit != null && query.limit !== '') {
    const rawLimit = query.limit;
    let n: number;
    if (typeof rawLimit === 'number') {
      n = rawLimit;
    } else if (typeof rawLimit === 'string') {
      n = parseInt(rawLimit, 10);
    } else {
      throw new BadRequestException('limit 无效');
    }
    if (!Number.isFinite(n) || n < 1) {
      throw new BadRequestException('limit 无效');
    }
    limit = Math.min(MAX_LIMIT, Math.trunc(n));
  }

  return { q, limit };
}

/** 输入一堆「带分数的 chunk」，输出「按文件聚合、按相关度排序」的列表。 */
export function aggregateMaxScoreByFile(
  chunks: ChunkScoreInput[],
): AggregatedFileScore[] {
  const best = new Map<number, AggregatedFileScore>(); // 建一个 Map，key = userFileId（文件 id），value = 该文件目前见到的「最佳代表」。
  // 遍历所有 chunk，找到每个文件的最高分 chunk
  for (const c of chunks) {
    // 	先把这块正文做成摘录：超过 EXCERPT_MAX（160）就截断并加 …，否则用全文。即使这块最后不是最高分，也会先算好；只有更新 best 时才会写进去。
    const excerpt =
      c.content.length > EXCERPT_MAX
        ? c.content.slice(0, EXCERPT_MAX) + '…'
        : c.content;
    const prev = best.get(c.userFileId); //看这个文件在 Map 里有没有已经记过的结果。
    //两种情况要更新：① 这个文件还没出现过（!prev）；② 当前块分数比已有记录更高。
    if (!prev || c.score > prev.score) {
      //把该文件的代表改成「当前这块」：记下文件 id、分数、块序号、摘录。
      best.set(c.userFileId, {
        userFileId: c.userFileId,
        score: c.score,
        chunkIndex: c.chunkIndex,
        excerpt,
      });
    }
  }
  // Map 的 values 摊成数组，再按 score 从高到低排，相关文件排在前面。
  return [...best.values()].sort((a, b) => b.score - a.score);
}

// 把数据库里的 embedding（Prisma 存成 Json，类型是 unknown）安全转成 number[]
export function asEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    return null;
  }
  return value as number[];
}

@Injectable()
export class FilesSearchService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * 对当前用户已索引（ready）文件做语义检索，按相关度返回文件列表。
   * @param userId 当前登录用户 id
   * @param query 原始查询对象（含 q、可选 limit）
   * @returns items（按分排序）+ indexedFileCount + 回显 q；无索引时 items 为空且 indexedFileCount=0
   */
  async semanticSearch(
    userId: number,
    query: Record<string, unknown>,
  ): Promise<SemanticSearchResult> {
    const { q, limit } = parseSemanticSearchQuery(query);
    // 查索引任务表,只要索引完成（ready）；通过关联 userFile 限定「当前用户、未删除」
    const readyJobs = await this.prisma.documentIndexJob.findMany({
      where: {
        status: 'ready',
        userFile: { userId, isDeleted: false },
      },
      select: { userFileId: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_INDEXED_FILES, // 最多返回 200 个文件。防止全库扫爆内存。
    });
    const indexedFileCount = readyJobs.length;
    //一个 ready 都没有 → 正常 200 + 空列表，不抛错（方便前端引导「去建索引」）。
    if (indexedFileCount === 0) {
      return { items: [], indexedFileCount: 0, q };
    }
    //抽出 id 数组，供下一步 in: fileIds。
    const fileIds = readyJobs.map((j) => j.userFileId);
    // 获取所有已经索引好的文件的 chunk
    const chunks = await this.prisma.documentChunk.findMany({
      where: { userFileId: { in: fileIds } },
      select: {
        id: true,
        userFileId: true,
        chunkIndex: true,
        content: true,
        embedding: true,
      },
    });
    let queryEmbedding: number[];
    try {
      // 调用向量服务，把搜索词转换成向量。后面和每个 chunk 向量比相似度。
      queryEmbedding = await embedOne(q);
    } catch {
      throw new ServiceUnavailableException('向量服务暂时不可用');
    }
    // 计算每个 chunk 与搜索词的相似度
    const scored: ChunkScoreInput[] = [];
    for (const row of chunks) {
      const emb = asEmbedding(row.embedding);
      if (!emb) continue;
      scored.push({
        chunkId: row.id,
        userFileId: row.userFileId,
        chunkIndex: row.chunkIndex,
        content: row.content,
        score: cosineSimilarity(queryEmbedding, emb),
      });
    }
    // 按文件聚合、按相关度排序
    //对每块打过分的列表：每个文件只留最高分那一块，再按分从高到低排；.slice(0, limit) 只取前 limit 条（默认 20）。
    const ranked = aggregateMaxScoreByFile(scored)
      .filter((c) => c.score >= MIN_SCORE || c.excerpt.includes(q))
      .slice(0, limit);
    // 聚合后一个文件都没有（例如全是无效 embedding）→ 返回空列表。注意这里仍带上 indexedFileCount（前面已算过），方便前端写「有索引但没命中」。
    if (ranked.length === 0) {
      return { items: [], indexedFileCount, q };
    }
    // 开始查这些命中文件的展示信息（文件名、类型等）
    const files = await this.prisma.userFile.findMany({
      where: {
        id: { in: ranked.map((r) => r.userFileId) },
        userId,
        isDeleted: false,
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        parentId: true,
        storage: {
          select: { mimeType: true, fileSize: true },
        },
      },
    });
    // 把查询结果做成 文件id → 行 的 Map，后面按 id 查找是 O(1)。
    const fileById = new Map(files.map((f) => [f.id, f]));
    const items: SemanticSearchItem[] = []; // 最终要返回给 API 的结果数组。
    // 按 相关度顺序（ranked）遍历，保证 items 顺序正确
    for (const r of ranked) {
      const f = fileById.get(r.userFileId); // 用聚合结果里的文件 id，去 Map 里取文件行。
      if (!f) continue;
      // 拼一条搜索结果
      items.push({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        mimeType: f.storage?.mimeType ?? null,
        fileSize:
          f.storage?.fileSize != null ? Number(f.storage.fileSize) : null,
        parentId: f.parentId,
        score: Number(r.score.toFixed(4)),
        excerpt: r.excerpt,
        chunkIndex: r.chunkIndex,
      });
    }
    // 返回：有序结果列表 + 参与检索的已索引文件数 + 回显查询词。
    return { items, indexedFileCount, q };
  }
}
