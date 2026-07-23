import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesAiAssistantService } from '@/files/ai/assistant/files-ai-assistant.service';

@Controller('ai/assistant')
export class FilesAiAssistantController {
  constructor(private readonly assistantService: FilesAiAssistantService) {}

  /**
   * 网盘 AI 助手（Function Calling MVP）：流式 text/plain。
   * Body: { message, messages?, parentId? }
   */
  @Post('chat')
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    await this.assistantService.chat(req, res, user.id, body);
  }
}
