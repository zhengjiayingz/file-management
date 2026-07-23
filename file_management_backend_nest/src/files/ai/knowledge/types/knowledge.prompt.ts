/** 拼装 prompt，不写 LLM 调用 */

export const KNOWLEDGE_BASE_RULES = [
  '你是学术文献知识抽取助手。',
  '仅根据下方「检索片段」填写结构化字段。',
  '片段中没有的信息：字符串用 null，列表用 []，禁止编造。',
  '输出使用中文（专有名词可保留英文）。',
  'keyFindings / definitions 的 section：能判断则填 results/method/introduction 等，否则填 unknown。',
  '不要在输出中出现「片段 N」等内部标记。',
].join('\n');

export type KnowledgePromptChunk = {
  chunkIndex: number;
  content: string;
};

export function buildFieldGroupPrompt(
  task: string,
  fieldHints: string,
  chunks: KnowledgePromptChunk[],
): string {
  const blocks = chunks
    .map((c) => `--- 片段 ${c.chunkIndex} ---\n${c.content}`)
    .join('\n\n');

  return [
    KNOWLEDGE_BASE_RULES,
    `任务：${task}`,
    `字段说明：${fieldHints}`,
    '',
    '【检索片段】',
    blocks || '（无可用片段）',
  ].join('\n');
}
