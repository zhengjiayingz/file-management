/**拼装 prompt 字符串，不写 LLM 调用。 */

import type { SummaryGenreValue } from './summary-genre.types';

export const BASE_RULES = [
  '你是文档摘要助手。',
  '仅根据用户提供的文本或下级摘要作答。',
  '信息不足时使用 null 或空数组，禁止编造。',
  '输出使用中文。',
  '不要在摘要中出现「片段 N」「参考材料」等内部标记。',
].join('\n');

const GENRE_HINTS: Record<SummaryGenreValue, string> = {
  novel: '体裁：小说。关注情节、人物、主题，不要写成论文摘要。',
  general_nonfiction:
    '体裁：通识读物（历史/传记/非虚构）。关注时间线、关键人物、因果脉络。',
  technical: '体裁：技术文档。关注目的、步骤、配置、注意事项。',
  textbook: '体裁：教材/讲义。关注章节脉络、定义、例题类型、先修知识。',
  lab_report: '体裁：实验报告。关注研究问题、方法、结果、结论。',
  paper: '体裁：期刊论文。关注研究问题、方法、发现、贡献与局限。',
};

export function buildChunkPrompt(
  genre: SummaryGenreValue,
  chunkText: string,
): string {
  return [
    BASE_RULES,
    GENRE_HINTS[genre],
    '任务：为下方「原文片段」生成结构化块摘要。',
    '字段要求：summary 为连贯段落；keyPoints 为条目化要点。',
    'JSON 示例：{"summary":"…","keyPoints":["要点1","要点2"]}',
    '',
    '【原文片段】',
    chunkText,
  ].join('\n');
}

export function buildChapterPrompt(
  genre: SummaryGenreValue,
  chapterNo: number,
  chunkSummariesJson: string,
): string {
  return [
    BASE_RULES,
    GENRE_HINTS[genre],
    `任务：将第 ${chapterNo} 章的多条块摘要合并为一条章节摘要。`,
    '只能使用下方 JSON，不要臆造原文中没有的信息。',
    '输出字段与块摘要相同：summary + keyPoints。',
    'JSON 示例：{"summary":"…","keyPoints":["要点1"]}',
    '',
    '【块摘要 JSON】',
    chunkSummariesJson,
  ].join('\n');
}

export function buildBookPrompt(
  genre: SummaryGenreValue,
  intermediateSummariesJson: string,
): string {
  return [
    BASE_RULES,
    GENRE_HINTS[genre],
    '任务：根据下方「下级摘要 JSON」生成全书结构化摘要。',
    '禁止直接引用或复述大段原文，只能综合已有摘要。',
    '字段名必须与 schema 一致；无信息则 null 或 []。',
    '',
    '【下级摘要 JSON】',
    intermediateSummariesJson,
  ].join('\n');
}
