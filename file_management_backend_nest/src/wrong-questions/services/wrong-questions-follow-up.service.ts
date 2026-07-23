import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { streamMathVisionChat } from '@/files/ai/math/provider/math-vision.provider';
import {
  assertSolveMathImageFile,
  validateSolveMathInput,
} from '@/files/ai/math/service/files-ai-math.service';

/** 错题详情追问用的 System Prompt */
function buildFollowUpSystemPrompt(fileName?: string | null): string {
  const fileLine = fileName ? `【文件】${fileName}\n` : '';
  return [
    '你是数学学习辅助助手，根据题目图片继续回答用户追问。',
    '关键步骤说明理由；公式使用 LaTeX（$...$ 或 $$...$$）。',
    '看不清的条件请明确指出，不要编造。',
    '优先使用中文作答。',
    fileLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function isClientErrorMessage(message: string): boolean {
  return (
    message.includes('不能为空') ||
    message.includes('请求体') ||
    message.includes('对话历史') ||
    message.includes('仅支持') ||
    message.includes('图片') ||
    message.includes('原图不可用')
  );
}

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
export class WrongQuestionsFollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /** 错题二次追问：读原题图 → VL 流式纯文本 */
  async followUp(
    req: Request,
    res: Response,
    userId: number,
    wrongQuestionId: number,
    body: unknown,
  ): Promise<void> {
    try {
      const input = validateSolveMathInput(body);

      const item = await this.prisma.wrongQuestionBookItem.findFirst({
        where: { id: wrongQuestionId, userId },
        select: {
          userFileId: true,
          userFile: {
            select: {
              fileName: true,
              isDeleted: true,
              storage: { select: { filePath: true, mimeType: true } },
            },
          },
        },
      });
      if (!item) {
        res.status(404).json({ success: false, message: '错题不存在' });
        return;
      }
      if (
        !item.userFileId ||
        !item.userFile ||
        item.userFile.isDeleted ||
        !item.userFile.storage
      ) {
        res.status(400).json({ success: false, message: '原图不可用' });
        return;
      }

      assertSolveMathImageFile(
        item.userFile.fileName,
        item.userFile.storage.mimeType,
      );

      const storage = this.storageService.getStorageProvider();
      const exists = await storage.exists(item.userFile.storage.filePath);
      if (!exists) {
        res.status(400).json({ success: false, message: '原图不可用' });
        return;
      }

      const buffer = await readStreamToBuffer(
        await storage.getReadStream(item.userFile.storage.filePath),
      );
      if (!buffer.length) {
        throw new Error('图片内容为空');
      }

      const mime =
        (item.userFile.storage.mimeType ?? 'image/png').trim().toLowerCase() ||
        'image/png';
      const imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');

      await streamMathVisionChat({
        imageDataUrl,
        system: buildFollowUpSystemPrompt(
          input.fileName ?? item.userFile.fileName,
        ),
        history: input.messages,
        question: input.question,
        abortSignal: abortController.signal,
        onChunk: (text) => {
          res.write(text);
        },
      });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : '追问失败';
      if (res.headersSent) {
        console.error('[wrong-questions follow-up] Stream error:', error);
        if (!res.writableEnded) res.end();
        return;
      }
      const status = isClientErrorMessage(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
