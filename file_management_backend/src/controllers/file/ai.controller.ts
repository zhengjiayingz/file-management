import { Response } from 'express';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import {
  streamAskAboutSelection,
  validateAskAboutSelectionInput,
} from '../../services/ai.service.js';

/**
 * 基于选中文字向 AI 提问（流式纯文本响应）
 * POST /api/files/:id/ai/ask
 * Body: { question, selectedText, fileName? }
 */
export const askAboutSelection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (Number.isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const input = validateAskAboutSelectionInput(req.body);

    const userFile = await prisma.userFile.findFirst({
      where: { id: fileId, userId: req.user.id, isDeleted: false },
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

    const result = streamAskAboutSelection({
      ...input,
      fileName: input.fileName ?? userFile.fileName,
      abortSignal: abortController.signal,
    });

    result.pipeTextStreamToResponse(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 问答失败';
    if (res.headersSent) {
      console.error('[AI ask] Stream error:', error);
      return;
    }
    const status = message.includes('不能为空') || message.includes('选中') || message.includes('请求体')
      ? 400
      : 500;
    res.status(status).json({ success: false, message });
  }
};
