import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';
import { embedOne } from '@/files/ai/index/provider/embedding.provider';
import { topKByEmbedding } from '@/files/ai/index/utils/similarity.util';
import type { SummaryGenreValue } from '@/files/ai/summary/types/summary-genre.types';
import { toIndexMode } from '@/files/ai/summary/types/summary-genre.types';
import { generateStructuredObject } from '@/files/ai/chat/utils/structured-object.util';
import {
  mergePaperKnowledge,
  paperContributionsGroupSchema,
  paperDefinitionsGroupSchema,
  paperFindingsGroupSchema,
  paperMetaGroupSchema,
  paperMethodologyGroupSchema,
  paperTitleGroupSchema,
  type PaperKnowledge,
} from '@/files/ai/knowledge/types/knowledge.schemas';
import { buildFieldGroupPrompt } from '@/files/ai/knowledge/types/knowledge.prompt';

/** 仅期刊论文（paper）知识卡片分字段 RAG；小说/通识摘要不走此逻辑 */
const DEFAULT_PAPER_KNOWLEDGE_TOP_K = 12;

function resolvePaperKnowledgeTopK(): number {
  const fromEnv = Number.parseInt(
    process.env.AI_PAPER_KNOWLEDGE_TOP_K?.trim() || '',
    10,
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return DEFAULT_PAPER_KNOWLEDGE_TOP_K;
}

type KnowledgePayload = Prisma.InputJsonValue;

type EmbeddedChunk = {
  id: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
};

type FieldGroupDef<T extends z.ZodTypeAny> = {
  id: string;
  query: string;
  schema: T;
  task: string;
  fieldHints: string;
};

const PAPER_FIELD_GROUPS: FieldGroupDef<z.ZodTypeAny>[] = [
  {
    id: 'title',
    query: 'title paper name',
    schema: paperTitleGroupSchema,
    task: '抽取论文标题。',
    fieldHints: 'title：论文标题；文首/摘要中通常出现。',
  },
  {
    id: 'contributions',
    query: 'research question contribution introduction abstract',
    schema: paperContributionsGroupSchema,
    task: '抽取研究问题与主要贡献。',
    fieldHints:
      'researchQuestion：核心研究问题，无则 null；contributions：贡献列表，没有则 []。',
  },
  {
    id: 'methodology',
    query: 'method dataset metric experiment model architecture',
    schema: paperMethodologyGroupSchema,
    task: '抽取方法、数据集与评价指标。',
    fieldHints:
      'methodology.approach：方法/模型；dataset：数据集，无则 null；metrics：指标列表。',
  },
  {
    id: 'findings',
    query: 'result finding outcome experiment performance',
    schema: paperFindingsGroupSchema,
    task: '抽取主要研究发现。',
    fieldHints:
      'keyFindings：每条含 claim、evidence（无则 null）、section（unknown 可填）。',
  },
  {
    id: 'definitions',
    query: 'definition term concept notation',
    schema: paperDefinitionsGroupSchema,
    task: '抽取关键术语定义。',
    fieldHints: 'definitions：term、definition、section；没有则 []。',
  },
  {
    id: 'meta',
    query: 'limitation future work keyword',
    schema: paperMetaGroupSchema,
    task: '抽取局限、未来工作与关键词。',
    fieldHints: 'limitations / futureWork / keywords：均为列表，没有则 []。',
  },
];

function asEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  return value as number[];
}

@Injectable()
export class KnowledgeExtractService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadEmbeddedChunks(
    userFileId: number,
  ): Promise<EmbeddedChunk[]> {
    const rows = await this.prisma.documentChunk.findMany({
      where: { userFileId },
      select: {
        id: true,
        chunkIndex: true,
        content: true,
        embedding: true,
      },
      orderBy: { chunkIndex: 'asc' },
    });

    const chunks: EmbeddedChunk[] = [];
    for (const row of rows) {
      const embedding = asEmbedding(row.embedding);
      if (!embedding) continue;
      chunks.push({
        id: row.id,
        chunkIndex: row.chunkIndex,
        content: row.content,
        embedding,
      });
    }
    return chunks;
  }

  private async extractFieldGroup<T extends z.ZodTypeAny>(
    group: FieldGroupDef<T>,
    chunks: EmbeddedChunk[],
    topK: number,
  ): Promise<z.infer<T>> {
    //把该组的英文检索 query 转成向量。例：title 组 query 是 'title paper name'，
    // methodology 组是 'method dataset metric experiment model architecture'
    const queryEmbedding = await embedOne(group.query);
    //用余弦相似度在所有 chunk 向量里找与 query 最相近的 topK 条，
    // 返回的是 chunk 的 id 列表（按相似度从高到低）。
    // 和全文 RAG 问答同一套 topKByEmbedding 逻辑，只是 query 换成字段组专用关键词
    const topIds = topKByEmbedding(
      queryEmbedding,
      chunks.map((c) => ({ id: c.id, embedding: c.embedding })),
      topK,
    );
    // 根据 id 找回完整 chunk（含 content、chunkIndex）
    const selected = topIds
      .map((id) => chunks.find((c) => c.id === id))
      .filter((c): c is EmbeddedChunk => c != null); // 去掉 find 找不到的（理论上不应出现）c is EmbeddedChunk 是 TypeScript 类型收窄，保证后面 selected 元素类型正确
    // 拼给 LLM 的 prompt
    const prompt: string = buildFieldGroupPrompt(
      group.task,
      group.fieldHints,
      selected.map((c) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
      })),
    );
    // 调 DeepSeek（generateObject），要求按 Zod schema 输出 JSON
    return generateStructuredObject({
      schema: group.schema as z.ZodType<z.infer<T>>, // schema：本组校验规则（如 paperTitleGroupSchema）
      prompt,
      schemaName: group.id, // 组 id（title、contributions 等），用于日志/调试
    });
  }

  private async persistKnowledge(
    userFileId: number,
    payload: KnowledgePayload,
  ): Promise<void> {
    await this.prisma.documentKnowledge.upsert({
      where: { userFileId },
      create: { userFileId, payload },
      update: { payload },
    });
  }

  private async extractPaperKnowledge(
    userFileId: number,
    chunks: EmbeddedChunk[], // 已从数据库加载的切片，每条包含 id、chunkIndex、content、embedding
  ): Promise<void> {
    const topK = Math.min(resolvePaperKnowledgeTopK(), chunks.length); // 决定每组字段 RAG 时取多少个最相关 chunk
    const partials: Array<Partial<PaperKnowledge>> = []; // 准备一个空数组，存放 6 组字段各自抽取的局部结果，Partial<PaperKnowledge>：每组只填一部分字段，例如：title 组只有 title
    // 遍历 6 个字段组，顺序固定：
    for (const group of PAPER_FIELD_GROUPS) {
      const partial = await this.extractFieldGroup(group, chunks, topK); // 调用 extractFieldGroup（141–171 行），单组完整流程
      partials.push(partial as Partial<PaperKnowledge>); // 把本组结果推进 partials
    }
    /**
     * 循环结束后 partials 大致是：
     * [
     *   { title: '论文标题' },
     *   { researchQuestion: '研究问题', contributions: ['贡献1', '贡献2'] },
     *   { methodology: { approach: '方法', dataset: '数据集', metrics: ['指标1', '指标2'] } },
     *   { keyFindings: [{ claim: '结论1', evidence: '证据1', section: '第1章' }, { claim: '结论2', evidence: '证据2', section: '第2章' }] },
     *   { definitions: [{ term: '术语1', definition: '定义1', section: '第1章' }, { term: '术语2', definition: '定义2', section: '第2章' }] },
     *   { limitations: ['局限1', '局限2'], futureWork: ['展望1', '展望2'], keywords: ['关键词1', '关键词2'] }
     * ]
     */
    const payload = mergePaperKnowledge(partials); // 把 6 组局部结果合成一张完整论文卡片
    await this.persistKnowledge(userFileId, payload); // 把完整卡片入库
  }

  /** Worker 入口：分字段 RAG + generateObject → merge → 入库 */
  async extractKnowledge(
    userFileId: number,
    genre: SummaryGenreValue,
  ): Promise<void> {
    if (toIndexMode(genre) !== 'academic') {
      return;
    }

    const chunks = await this.loadEmbeddedChunks(userFileId);
    if (chunks.length === 0) {
      throw new Error('无可用 chunk，无法抽取知识卡片');
    }

    if (genre === 'paper') {
      await this.extractPaperKnowledge(userFileId, chunks);
      return;
    }

    if (genre === 'lab_report') {
      throw new Error('lab_report 知识卡片抽取尚未实现');
    }

    throw new Error(`体裁 ${genre} 不支持知识卡片`);
  }
}
