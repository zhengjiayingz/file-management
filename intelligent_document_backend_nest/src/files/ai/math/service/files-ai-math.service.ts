import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { streamMathVisionChat } from '@/files/ai/math/provider/math-vision.provider';

import {
  clampText,
  MAX_QUESTION_CHARS,
  validateMessages,
  type ChatMessage,
} from '@/files/ai/chat/utils/chat-message.util';

/** 解题追问时服务端保留的最近文字消息条数（产品约定 N=6） */
export const SOLVE_MATH_HISTORY_LIMIT = 6;

/** 校验通过后的解题请求入参（问题 + 截断后的历史 + 可选文件名） */
export type SolveMathInput = {
  question: string;
  messages: ChatMessage[];
  fileName?: string;
};

/** 将对话历史截断为最近 limit 条，超出则丢弃更早的消息 */
export function takeLastMessages(
  messages: ChatMessage[],
  limit = SOLVE_MATH_HISTORY_LIMIT,
): ChatMessage[] {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}

/** 校验 solve-math 请求体：必填 question，规范化 messages / fileName */
export function validateSolveMathInput(body: unknown): SolveMathInput {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体无效');
  }

  const { question, messages, fileName } = body as Record<string, unknown>;

  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('问题不能为空');
  }

  return {
    question: clampText(question, MAX_QUESTION_CHARS),
    messages: takeLastMessages(validateMessages(messages)),
    fileName:
      typeof fileName === 'string' ? fileName.trim().slice(0, 255) : undefined,
  };
}

const SOLVE_MATH_IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);
const SOLVE_MATH_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

/** 解题 System Prompt：分步推理、LaTeX、勿编造、优先中文 */
function buildSolveMathSystemPrompt(fileName?: string): string {
  const fileLine = fileName ? `【文件】${fileName}\n` : '';
  return [
    '你是数学学习辅助助手，根据题目图片分步解答。',
    '关键步骤说明理由；公式使用 LaTeX（$...$ 或 $$...$$）。',
    '看不清的条件请明确指出，不要编造。',
    '结尾可提醒用户自行验算。',
    '优先使用中文作答。',
    fileLine,
  ]
    .filter(Boolean)
    .join('\n');
}
/** 判断是否为客户端可预期的入参/类型错误（映射 400） */
function isClientErrorMessage(message: string): boolean {
  return (
    message.includes('不能为空') ||
    message.includes('请求体') ||
    message.includes('对话历史') ||
    message.includes('仅支持') ||
    message.includes('图片')
  );
}
/** 校验文件名扩展名 + MIME，仅允许解题白名单图片 */
export function assertSolveMathImageFile(
  fileName: string,
  mimeType: string | null | undefined,
): void {
  const mime = (mimeType ?? '').trim().toLowerCase();
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot) : '';
  if (!SOLVE_MATH_IMAGE_EXTS.has(ext) || !SOLVE_MATH_IMAGE_MIMES.has(mime)) {
    throw new Error('仅支持 png/jpg/jpeg/webp/gif 图片解题');
  }
}
/** 将可读流完整读入 Buffer */
async function readStreamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
@Injectable()
export class FilesAiMathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}
  /** 网盘图片解题入口：校验 → 读图 → VL 流式写入 Response */
  async solveMath(
    req: Request,
    res: Response,
    userId: number,
    fileId: number,
    body: unknown,
  ): Promise<void> {
    try {
      // 取出问题和历史
      const input = validateSolveMathInput(body);
      // 取出文件记录
      const userFile = await this.prisma.userFile.findFirst({
        where: { id: fileId, userId, isDeleted: false },
        select: {
          fileName: true,
          storage: { select: { filePath: true, mimeType: true } },
        },
      });
      if (!userFile?.storage) {
        res.status(404).json({ success: false, message: '文件不存在' });
        return;
      }
      // 校验文件名扩展名 + MIME，仅允许解题白名单图片
      assertSolveMathImageFile(userFile.fileName, userFile.storage.mimeType);
      // 取出存储服务
      const storage = this.storageService.getStorageProvider();
      // 检查文件是否存在
      const exists = await storage.exists(userFile.storage.filePath);
      if (!exists) {
        res
          .status(404)
          .json({ success: false, message: '文件不存在或已被删除' });
        return;
      }
      // 读取文件内容进 Buffer
      const buffer = await readStreamToBuffer(
        await storage.getReadStream(userFile.storage.filePath),
      );
      if (!buffer.length) {
        throw new Error('图片内容为空');
      }
      const mime =
        (userFile.storage.mimeType ?? 'image/png').trim().toLowerCase() ||
        'image/png';
      // 将 Buffer 转换为 Base64 编码的 Data URL
      const imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      // 创建一个 AbortController 用于处理请求中断
      const abortController = new AbortController();
      // 监听请求关闭事件，如果请求中断则终止流式对话
      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');

      // 手写硅基 SSE（image_url），避免 AI SDK 多模态 URL 被拒
      await streamMathVisionChat({
        imageDataUrl,
        system: buildSolveMathSystemPrompt(input.fileName ?? userFile.fileName),
        history: input.messages,
        question: input.question,
        abortSignal: abortController.signal,
        onChunk: (text) => {
          // ! 将流式对话结果写入响应流
          res.write(text);
        },
      });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : '解题失败';
      if (res.headersSent) {
        console.error('[AI solve-math] Stream error:', error);
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      const status = isClientErrorMessage(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
