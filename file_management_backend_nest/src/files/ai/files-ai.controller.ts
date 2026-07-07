import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesAiService } from './files-ai.service';

@Controller('files')
export class FilesAiController {
  constructor(private readonly filesAiService: FilesAiService) {}

  @Post(':id/ai/ask')
  async askAboutSelection(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesAiService.askAboutSelection(
      req,
      res,
      user.id,
      fileId,
      body,
    );
  }
}
