/**所有 Zod 结构定义。chunk 层通用；book 层 4 族。 */
import { z } from 'zod';

function llmString(fallback = '') {
  return z.preprocess((value) => {
    if (typeof value === 'string') return value.trim();
    if (value == null) return fallback;
    return String(value);
  }, z.string());
}

function llmStringArray() {
  return z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  }, z.array(z.string()));
}

function llmObjectArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.preprocess((value) => (Array.isArray(value) ? value : []), z.array(itemSchema));
}

/** Map 阶段 + chapter Reduce 中间层（通用） */
export const chunkSummarySchema = z.object({
  summary: llmString('（暂无摘要）').describe('该片段的核心内容，中文，简洁'),
  keyPoints: llmStringArray().describe('要点列表；无则空数组'),
});

export type ChunkSummary = z.infer<typeof chunkSummarySchema>;

/** novel / general_nonfiction 共用结构，靠 Prompt 区分 */
export const narrativeBookSchema = z.object({
  oneLiner: llmString().describe('一句话概括全书'),
  overview: llmString().describe('全书概览，2～5 段'),
  plotPoints: llmStringArray(),
  characters: llmObjectArray(
    z.object({
      name: llmString(),
      role: llmString(),
    }),
  ),
  themes: llmStringArray().optional(),
  timeScope: llmString().optional(),
  timeline: llmObjectArray(
    z.object({
      period: llmString(),
      event: llmString(),
    }),
  ).optional(),
  keyFigures: llmObjectArray(
    z.object({
      name: llmString(),
      significance: llmString(),
    }),
  ).optional(),
  causesAndEffects: llmStringArray().optional(),
});

/** technical / textbook */
export const instructionalBookSchema = z.object({
  purpose: llmString().describe('文档/教材目的'),
  overview: llmString(),
  sections: llmObjectArray(
    z.object({
      title: llmString(),
      summary: llmString(),
    }),
  ),
  keyPoints: llmStringArray(),
  prerequisites: llmStringArray().optional(),
});

/** lab_report */
export const academicBookSchema = z.object({
  researchQuestion: llmString(),
  method: llmString(),
  keyFindings: llmStringArray(),
  conclusions: llmStringArray(),
  limitations: llmStringArray().optional(),
});

/** paper = academic + 额外字段 */
export const paperBookSchema = academicBookSchema.extend({
  contributions: llmStringArray().optional(),
  relatedWork: llmString().optional(),
  futureWork: llmString().optional(),
});

export type NarrativeBookSummary = z.infer<typeof narrativeBookSchema>;
export type InstructionalBookSummary = z.infer<typeof instructionalBookSchema>;
export type AcademicBookSummary = z.infer<typeof academicBookSchema>;
export type PaperBookSummary = z.infer<typeof paperBookSchema>;
