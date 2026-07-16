/**体裁常量、UI 标签、校验、toIndexMode、pickBookSchema。 */
import type { DocumentIndexMode } from '@prisma/client';
import { $Enums } from '@prisma/client';
import type { z } from 'zod';
import {
  academicBookSchema,
  instructionalBookSchema,
  narrativeBookSchema,
  paperBookSchema,
} from './summary.schemas';

/** 由 prisma/schema.prisma 中 enum SummaryGenre 生成 */
export type SummaryGenreValue = $Enums.SummaryGenre;

const summaryGenreEnum = $Enums.SummaryGenre;

export const SUMMARY_GENRES = Object.values(summaryGenreEnum);

// 这里声明成Record类型主要作用是穷举检查，强制每个 SummaryGenreValue 都必须有一个 string 标签。
// 如果在 schema.prisma 里新增了枚举值（比如 biography），但没在这里补标签，在定义处就会报错：
export const SUMMARY_GENRE_LABELS: Record<SummaryGenreValue, string> = {
  novel: '小说',
  general_nonfiction: '通识读物',
  technical: '技术文档',
  textbook: '教材/讲义',
  lab_report: '实验报告',
  paper: '期刊论文',
};

/** 前端分组用（阶段 6） */
type SummaryGenreGroup = {
  readonly label: string;
  readonly genres: readonly SummaryGenreValue[];
};

export const SUMMARY_GENRE_GROUPS = [
  {
    label: '阅读',
    genres: ['novel', 'general_nonfiction'],
  },
  {
    label: '学习',
    genres: ['technical', 'textbook'],
  },
  {
    label: '科研',
    genres: ['lab_report', 'paper'],
  },
] as const satisfies readonly SummaryGenreGroup[]; // satisfies：检查这个值是否符合某种类型，但不把变量的类型“变宽”成那个类型。
export function isSummaryGenre(value: unknown): value is SummaryGenreValue {
  return typeof value === 'string' && value in summaryGenreEnum;
}
// 把用户选的细粒度「体裁」（summaryGenre，6 种）映射成粗粒度的「索引模式」（DocumentIndexMode，2 种）
export function toIndexMode(genre: SummaryGenreValue): DocumentIndexMode {
  if (genre === 'lab_report' || genre === 'paper') {
    return 'academic';
  }
  return 'general';
}
/**
 export const narrativeBookSchema = z.object({
  oneLiner: z.string(),
  overview: z.string(),
  // ...
});
 * 
arrativeBookSchema 不是普通对象，而是一个 Zod schema 对象，可以：
用 .parse() / .safeParse() 校验数据
用 generateObject({ schema }) 让 AI 按结构输出
 */
type BookSchema = z.ZodTypeAny;

/**
 * @param genre 体裁
 * @returns 书本结构
 * 根据用户选择的体裁，限制ai的输出结构
 */
export function pickBookSchema(genre: SummaryGenreValue): BookSchema {
  switch (genre) {
    case 'novel':
    case 'general_nonfiction':
      return narrativeBookSchema;
    case 'technical':
    case 'textbook':
      return instructionalBookSchema;
    case 'lab_report':
      return academicBookSchema;
    case 'paper':
      return paperBookSchema;
    default: {
      const _exhaustive: never = genre;
      return _exhaustive;
    }
  }
}
