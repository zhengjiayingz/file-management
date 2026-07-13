import { z } from 'zod';

/** LLM 输出容错：字符串字段 */
export function llmString(fallback = '') {
  return z.preprocess((value: unknown) => {
    if (typeof value === 'string') return value.trim();
    if (value == null) return fallback;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return fallback;
  }, z.string());
}

/** LLM 输出容错：可空字符串（无信息 → null，禁止编造占位） */
export function llmNullableString() {
  return z.preprocess((value: unknown) => {
    if (value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return null;
  }, z.string().nullable());
}

export function llmStringArray() {
  return z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  }, z.array(z.string()));
}

export function llmObjectArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.preprocess((value: unknown): unknown[] => {
    if (!Array.isArray(value)) return [];
    return value as unknown[];
  }, z.array(itemSchema));
}
