import { Injectable } from '@nestjs/common';
import { streamText } from 'ai';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { getChatModel } from '@/files/ai/utils/chat-model.provider';
import {
  clampText,
  MAX_OUTPUT_TOKENS,
} from '@/files/ai/utils/chat-message.util';
import { isMostlyChinese } from '@/files/ai/utils/detect-chinese.util';

const MAX_TRANSLATE_TEXT_CHARS = 8000;

export type TranslateTargetLang = 'default' | 'zh' | 'en' | 'ja';
export type ResolvedTranslateLang = 'zh' | 'en' | 'ja';

export type TranslateInput = {
  text: string;
  targetLang: TranslateTargetLang;
  fileName?: string;
  abortSignal?: AbortSignal;
};

const ALLOWED_TARGET: ReadonlySet<string> = new Set([
  'default',
  'zh',
  'en',
  'ja',
]);

const LANG_LABEL: Record<ResolvedTranslateLang, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
};

export function validateTranslateInput(body: unknown): TranslateInput {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体无效');
  }

  const { text, targetLang, fileName } = body as Record<string, unknown>;

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('请先选中要翻译的内容');
  }
  if (typeof targetLang !== 'string' || !ALLOWED_TARGET.has(targetLang)) {
    throw new Error('目标语言无效');
  }

  return {
    text: clampText(text, MAX_TRANSLATE_TEXT_CHARS),
    targetLang: targetLang as TranslateTargetLang,
    fileName:
      typeof fileName === 'string' ? fileName.trim().slice(0, 255) : undefined,
  };
}

export function resolveTargetLang(
  text: string,
  targetLang: TranslateTargetLang,
): ResolvedTranslateLang {
  if (targetLang === 'default') {
    return isMostlyChinese(text) ? 'en' : 'zh';
  }
  return targetLang;
}

function buildTranslateSystemPrompt(
  resolved: ResolvedTranslateLang,
  fileName?: string,
): string {
  const fileLine = fileName ? `【文件】${fileName}\n` : '';
  const langName = LANG_LABEL[resolved];
  return [
    '你是专业翻译助手。',
    `请将用户给出的原文翻译成${langName}。`,
    '只输出译文本身，不要加「译文：」等前缀，不要解释，不要注释。',
    '专有名词可保留原文或采用通行译法。',
    '若原文为空或无法翻译，用目标语言简短说明即可。',
    fileLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function isClientErrorMessage(message: string): boolean {
  return (
    message.includes('不能为空') ||
    message.includes('选中') ||
    message.includes('请求体') ||
    message.includes('目标语言')
  );
}

@Injectable()
export class FilesAiTranslateService {
  constructor(private readonly prisma: PrismaService) {}

  private streamTranslate(input: TranslateInput & { resolved: ResolvedTranslateLang }) {
    return streamText({
      model: getChatModel(),
      abortSignal: input.abortSignal,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: buildTranslateSystemPrompt(input.resolved, input.fileName),
      messages: [{ role: 'user' as const, content: input.text }],
    });
  }

  async translate(
    req: Request,
    res: Response,
    userId: number,
    fileId: number,
    body: unknown,
  ): Promise<void> {
    try {
      const input = validateTranslateInput(body);
      const resolved = resolveTargetLang(input.text, input.targetLang);

      const userFile = await this.prisma.userFile.findFirst({
        where: { id: fileId, userId, isDeleted: false },
        select: { fileName: true },
      });
      if (!userFile) {
        res.status(404).json({ success: false, message: '文件不存在' });
        return;
      }

      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      const result = this.streamTranslate({
        ...input,
        fileName: input.fileName ?? userFile.fileName,
        resolved,
        abortSignal: abortController.signal,
      });

      result.pipeTextStreamToResponse(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : '翻译失败';
      if (res.headersSent) {
        console.error('[AI translate] Stream error:', error);
        return;
      }
      const status = isClientErrorMessage(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
