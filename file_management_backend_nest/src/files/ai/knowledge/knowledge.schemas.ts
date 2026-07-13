/**
 * F-06 学术知识卡片 Zod Schema
 * - 写入 DocumentKnowledge.payload
 * - generateObject 按字段组抽取，再 merge 成完整卡片
 */
import { z } from 'zod';
import type { SummaryGenreValue } from '@/files/ai/summary/summary-genre.types';
import {
  llmNullableString,
  llmObjectArray,
  llmString,
  llmStringArray,
} from '@/files/ai/utils/llm-schema.util';

// ---------- 子结构 ----------
// 一条「研究发现」
export const knowledgeFindingSchema = z.object({
  claim: llmString().describe('发现了什么'),
  evidence: llmNullableString().describe('依据，如 Table 2；无则 null'),
  section: llmString('unknown').describe(
    '来源章节：results / method / unknown', // 来自哪一节
  ),
});
// 一条术语定义
export const knowledgeDefinitionSchema = z.object({
  term: llmString(), // 术语
  definition: llmString(), // 定义
  section: llmString('unknown'), // 来自哪一节
});

export const methodologySchema = z.object({
  approach: llmNullableString().describe('方法/模型'), // 方法/模型，可 null
  dataset: llmNullableString().describe('数据集；无则 null'), // 数据集，可 null
  metrics: llmStringArray().describe('评价指标'), // 指标列表，没有就 []
});

// ---------- 字段组（Step 4 分字段抽取用）----------

export const paperTitleGroupSchema = z.object({
  title: llmString(), // 论文标题
});

export const paperContributionsGroupSchema = z.object({
  researchQuestion: llmNullableString(), // 研究问题，可 null
  contributions: llmStringArray(), // 贡献，没有就 []
});

export const paperMethodologyGroupSchema = z.object({
  methodology: methodologySchema, // 方法/数据/指标
});
// 主要结论（带溯源）
export const paperFindingsGroupSchema = z.object({
  keyFindings: llmObjectArray(knowledgeFindingSchema),
});
// 术语定义
export const paperDefinitionsGroupSchema = z.object({
  definitions: llmObjectArray(knowledgeDefinitionSchema),
});
// 局限、展望、关键词
export const paperMetaGroupSchema = z.object({
  limitations: llmStringArray(),
  futureWork: llmStringArray(),
  keywords: llmStringArray(),
});

// ---------- 完整卡片（merge 后入库）----------

export const paperKnowledgeSchema = z.object({
  title: llmString(), // 标题
  researchQuestion: llmNullableString(), // 研究问题，可 null
  contributions: llmStringArray(), // 贡献，没有就 []
  methodology: methodologySchema, // 方法/数据/指标
  keyFindings: llmObjectArray(knowledgeFindingSchema), // 主要结论（带溯源）
  definitions: llmObjectArray(knowledgeDefinitionSchema), // 术语定义
  limitations: llmStringArray(), // 局限，没有就 []
  futureWork: llmStringArray(), // 展望，没有就 []
  keywords: llmStringArray(), // 关键词，没有就 []
});
// 推导出的 TypeScript 类型，给 service / 前端用。
export type PaperKnowledge = z.infer<typeof paperKnowledgeSchema>;

// 实验报告（体裁不同，字段不同）
export const labReportKnowledgeSchema = z.object({
  title: llmString(), // 标题
  objective: llmNullableString(), // 目标，可 null
  procedure: llmStringArray(), // 流程，没有就 []
  data: llmStringArray(), // 数据，没有就 []
  analysis: llmStringArray(), // 分析，没有就 []
  conclusion: llmStringArray(), // 结论，没有就 []
  limitations: llmStringArray().optional(), // 局限，没有就 []
});
// 推导出的 TypeScript 类型，给 service / 前端用。
export type LabReportKnowledge = z.infer<typeof labReportKnowledgeSchema>;

type KnowledgeSchema = z.ZodTypeAny; // 知识卡片 Schema

// 按用户选的体裁选哪张「表」 — 类似 pickBookSchema：
export function pickKnowledgeSchema(genre: SummaryGenreValue): KnowledgeSchema {
  switch (genre) {
    case 'paper':
      return paperKnowledgeSchema;
    case 'lab_report':
      return labReportKnowledgeSchema;
    default:
      throw new Error(`体裁 ${genre} 不支持知识卡片`);
  }
}

/** 把多轮 partial 结果合成一张完整论文卡片。*/
export function mergePaperKnowledge(
  partials: Array<Partial<PaperKnowledge>>,
): PaperKnowledge {
  // reduce：把多个 partial 对象叠在一起
  const merged = partials.reduce<Partial<PaperKnowledge>>(
    (acc, part) => ({
      ...acc,
      ...part,
      // methodology 单独合并：因为嵌套对象不能简单 ...spread，要逐字段 ?? 合并
      methodology: {
        approach:
          part.methodology?.approach ?? acc.methodology?.approach ?? null,
        dataset: part.methodology?.dataset ?? acc.methodology?.dataset ?? null,
        metrics: part.methodology?.metrics ?? acc.methodology?.metrics ?? [],
      },
    }),
    {},
  );
  // 最后 paperKnowledgeSchema.parse：缺字段补默认值（[]、null、''），并做最终 Zod 校验
  return paperKnowledgeSchema.parse({
    title: merged.title ?? '', // 标题
    researchQuestion: merged.researchQuestion ?? null, // 研究问题，可 null
    contributions: merged.contributions ?? [], // 贡献，没有就 []
    methodology: merged.methodology ?? {
      approach: null, // 方法/模型，可 null
      dataset: null, // 数据集，可 null
      metrics: [], // 指标列表，没有就 []
    }, // 方法/数据/指标
    keyFindings: merged.keyFindings ?? [], // 主要结论（带溯源）
    definitions: merged.definitions ?? [], // 术语定义
    limitations: merged.limitations ?? [], // 局限，没有就 []
    futureWork: merged.futureWork ?? [], // 展望，没有就 []
    keywords: merged.keywords ?? [], // 关键词，没有就 []
  });
}
