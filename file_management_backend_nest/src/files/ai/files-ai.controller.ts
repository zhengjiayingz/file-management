import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesAiIndexService } from '@/files/ai/files-ai-index.service';
import { FilesAiService } from '@/files/ai/files-ai.service';
import { FilesAiRagService } from '@/files/ai/files-ai-rag.service';

@Controller('files')
export class FilesAiController {
  constructor(
    private readonly filesAiService: FilesAiService,
    private readonly filesAiIndexService: FilesAiIndexService,
    private readonly filesAiRagService: FilesAiRagService,
  ) {}

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

  @Post(':id/ai/rag-ask')
  async ragAsk(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesAiRagService.ragAsk(req, res, user.id, fileId, body);
  }

  /** 触发文档索引（异步 BullMQ） */
  // （1）校验（文件归属、txt/md、是否已在索引中）
  // （2）写 DB（重置 document_index_jobs，删掉旧 chunks）
  // （3）往 BullMQ 丢任务，马上返回 { status: "pending" }
  @Post(':id/ai/index')
  triggerIndex(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: unknown,
  ) {
    return this.filesAiIndexService.triggerIndex(user.id, fileId, body);
  }
  /** 查询索引进度 */
  // 查询 指定文件索引的构建状态，用户点「建立索引」后，前端每隔几秒调一次这个接口，直到完成：
  @Get(':id/ai/index/status')
  getIndexStatus(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesAiIndexService.getIndexStatus(user.id, fileId);
  }
}
