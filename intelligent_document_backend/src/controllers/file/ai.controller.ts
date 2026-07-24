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
 * Body: { question, selectedText, messages?, fileName? }
 */
export const askAboutSelection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    // 路由 /:id/ai/ask 里的 id 转十进制整数
    const fileId = parseInt(req.params.id, 10);
    if (Number.isNaN(fileId)) { // 非数字（如 /abc/ai/ask）→ 400
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }
    // 调 ai.service.ts 校验 question、selectedText、messages 等；不合法会 throw，进 catch 返回 400
    const input = validateAskAboutSelectionInput(req.body);
    // 查库：该文件属于当前用户且未删除；只取 fileName
    const userFile = await prisma.userFile.findFirst({
      where: { id: fileId, userId: req.user.id, isDeleted: false },
      select: { fileName: true },
    });
    if (!userFile) { // 没找到→ 404
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    const abortController = new AbortController(); // 新建 AbortController，signal 传给下游 streamText
    req.on('close', () => { // 监听 HTTP 请求连接关闭（关标签页、点停止、fetch abort 等）
      if (!res.writableEnded) { // 响应还没正常结束 → abort()，通知 DeepSeek 停止生成，省 token
        abortController.abort();
      }
    });
    // 调 ai.service 的 streamAskAboutSelection；展开校验后的 input；fileName 优先用 body，否则用库里的文件名；带上 abortSignal
    // result 是 AI SDK streamText 的返回值，带流式能力
    const result = streamAskAboutSelection({
      ...input,
      fileName: input.fileName ?? userFile.fileName,
      abortSignal: abortController.signal,
    });
    // 把模型输出的文字块持续写入 Express res；
    // 从这里开始是流式返回，不再是 res.json把模型输出的文字块持续写入 Express res；
    // 从这里开始是流式返回，不再是 res.json，
    // 执行到 这一行后，响应头会发出，body 边生成边推；前端 getReader() 读的就是这个流。
    result.pipeTextStreamToResponse(res); // 流式响应给前端
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 问答失败';
    if (res.headersSent) {
      console.error('[AI ask] Stream error:', error);
      return;
    }
    const status = message.includes('不能为空') || message.includes('选中') || message.includes('请求体') || message.includes('对话历史')
      ? 400
      : 500;
    res.status(status).json({ success: false, message });
  }
};
