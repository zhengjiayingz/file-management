import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FilesAiTtsService } from '@/files/ai/tts/files-ai-tts.service';

@Controller('ai/tts')
export class FilesAiTtsController {
  constructor(private readonly filesAiTtsService: FilesAiTtsService) {}

  /** 预设音色列表 + 字数上限（登录用户均可） */
  @Get('voices')
  listVoices() {
    return this.filesAiTtsService.listVoices();
  }

  /**
   * 文本转语音，直接返回 mp3 二进制流（登录用户均可）。
   * @param body { text, voiceId?, style?, speed? }
   * @param res Express Response（绕过默认 JSON 包装）
   */
  @Post('speech')
  async speech(@Body() body: unknown, @Res() res: Response) {
    const buf = await this.filesAiTtsService.synthesize(body);
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  }
}
