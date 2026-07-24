import {
  extractJsonMiddleware,
  generateObject,
  wrapLanguageModel,
  type LanguageModelMiddleware,
} from 'ai';
import { z } from 'zod';
import { getChatModel } from '@/files/ai/chat/provider/chat-model.provider';

const MAX_ATTEMPTS = 3;

function needsJsonObjectFallback(): boolean {
  const baseUrl = process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com';
  return (
    baseUrl.includes('deepseek') ||
    process.env.AI_STRUCTURED_JSON_MODE?.trim() === 'json_object'
  );
}

/** 将 json_schema 降级为 json_object，避免 DeepSeek 400 */
function jsonObjectOnlyMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v4',
    transformParams: ({ params }) => {
      const format = params.responseFormat;
      if (
        format?.type === 'json' &&
        'schema' in format &&
        format.schema != null
      ) {
        return Promise.resolve({
          ...params,
          responseFormat: { type: 'json' as const },
        });
      }
      return Promise.resolve(params);
    },
  };
}

export function getStructuredOutputModel() {
  const middleware: LanguageModelMiddleware[] = [extractJsonMiddleware()];
  if (needsJsonObjectFallback()) {
    middleware.unshift(jsonObjectOnlyMiddleware());
  }
  return wrapLanguageModel({
    model: getChatModel(),
    middleware,
  });
}

const JSON_OUTPUT_SUFFIX =
  '\n\n输出要求：仅返回一个合法 JSON 对象（json），字段名必须使用英文 key；不要使用 markdown 代码块；信息不足时使用 null 或空数组 []。';

function buildSchemaInstruction(schema: z.ZodType): string {
  if (!needsJsonObjectFallback()) return '';
  try {
    const jsonSchema = z.toJSONSchema(schema, { unrepresentable: 'any' });
    return `\n\n【JSON Schema，字段名必须完全一致】\n${JSON.stringify(jsonSchema, null, 2)}`;
  } catch {
    return '';
  }
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return candidate.slice(start, end + 1);
  }
  return null;
}

type GenerateStructuredObjectOptions<T> = {
  schema: z.ZodType<T>;
  prompt: string;
  schemaName?: string;
  schemaDescription?: string;
};

export async function generateStructuredObject<T>(
  options: GenerateStructuredObjectOptions<T>,
): Promise<T> {
  const schemaInstruction = buildSchemaInstruction(options.schema);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const retryHint =
        attempt > 1
          ? `\n\n（第 ${attempt} 次尝试）上次输出未通过 JSON 校验，请严格按 Schema 输出，不要添加额外字段名翻译。`
          : '';

      const { object } = await generateObject({
        model: getStructuredOutputModel(),
        schema: options.schema,
        prompt: `${options.prompt}${JSON_OUTPUT_SUFFIX}${schemaInstruction}${retryHint}`,
        schemaName: options.schemaName,
        schemaDescription: options.schemaDescription,
        experimental_repairText: ({ text }) =>
          Promise.resolve(extractJsonObject(text)),
      });
      return object;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
