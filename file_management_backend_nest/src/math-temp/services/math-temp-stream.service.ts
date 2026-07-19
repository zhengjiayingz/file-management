import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { validateMessages } from '@/files/ai/utils/chat-message.util';
import { takeLastMessages } from '@/files/ai/files-ai-math.service';
import { streamMathVisionChat } from '@/files/ai/vision/math-vision.provider';
import { MathTempImagesService } from './math-temp-images.service';

function isClientErrorMessage(message: string): boolean {
  return (
    message.includes('请') ||
    message.includes('仅支持') ||
    message.includes('不能') ||
    message.includes('无效') ||
    message.includes('不存在') ||
    message.includes('过期')
  );
}

@Injectable()
export class MathTempStreamService {
  constructor(private readonly tempImages: MathTempImagesService) {}

  /** 临时图自然语言问答（VL，整图） */
  async ask(
    req: Request,
    res: Response,
    userId: number,
    tempImageId: string,
    body: unknown,
  ): Promise<void> {
    await this.streamWithSystem(
      req,
      res,
      userId,
      tempImageId,
      body,
      '你是有帮助的助手。根据用户提供的图片回答问题，使用简明中文；涉及公式时用 LaTeX。',
      '问答失败',
    );
  }

  /** 临时图解题（对齐 F-27） */
  async solve(
    req: Request,
    res: Response,
    userId: number,
    tempImageId: string,
    body: unknown,
  ): Promise<void> {
    await this.streamWithSystem(
      req,
      res,
      userId,
      tempImageId,
      body,
      '你是数学解题助手。请根据题目图片分步解答，公式使用 LaTeX（$...$ 或 $$...$$）。AI 辅助，请验算。',
      '解题失败',
    );
  }

  private async streamWithSystem(
    req: Request,
    res: Response,
    userId: number,
    tempImageId: string,
    body: unknown,
    system: string,
    failLabel: string,
  ): Promise<void> {
    try {
      const raw = (body ?? {}) as {
        question?: unknown;
        messages?: unknown;
      };
      if (typeof raw.question !== 'string' || !raw.question.trim()) {
        res.status(400).json({ success: false, message: '请提供问题' });
        return;
      }
      const question = raw.question.trim();
      const messages = takeLastMessages(validateMessages(raw.messages), 6);

      const { imageDataUrl } = await this.tempImages.readAsDataUrl(
        userId,
        tempImageId,
      );

      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');

      await streamMathVisionChat({
        imageDataUrl,
        system,
        history: messages,
        question,
        abortSignal: abortController.signal,
        onChunk: (text) => {
          res.write(text);
        },
      });
      res.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : failLabel;
      if (res.headersSent) {
        console.error('[math-temp stream]', error);
        if (!res.writableEnded) res.end();
        return;
      }
      const status =
        message.includes('过期') || message.includes('已使用') || message.includes('丢失')
          ? 410
          : isClientErrorMessage(message)
            ? 400
            : message.includes('不存在')
              ? 404
              : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
