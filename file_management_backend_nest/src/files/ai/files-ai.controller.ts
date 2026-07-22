import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesAiIndexService } from '@/files/ai/files-ai-index.service';
import { FilesAiService } from '@/files/ai/files-ai.service';
import { FilesAiRagService } from '@/files/ai/files-ai-rag.service';
import { FilesAiSummaryService } from '@/files/ai/files-ai-summary.service';
import type { DocumentSummaryResponse } from '@/files/ai/files-ai-summary.service';
import { FilesAiKnowledgeService } from '@/files/ai/files-ai-knowledge.service';
import type { DocumentKnowledgeResponse } from '@/files/ai/files-ai-knowledge.service';
import { FilesAiTranslateService } from '@/files/ai/files-ai-translate.service';
import { FilesAiMathService } from '@/files/ai/files-ai-math.service';
import { FilesAiChatSessionService } from '@/files/ai/files-ai-chat-session.service';
import { AppendFileAiChatMessageDto } from '@/files/ai/dto/file-ai-chat.dto';

@Controller('files')
export class FilesAiController {
  constructor(
    private readonly filesAiService: FilesAiService,
    private readonly filesAiIndexService: FilesAiIndexService,
    private readonly filesAiRagService: FilesAiRagService,
    private readonly filesAiSummaryService: FilesAiSummaryService,
    private readonly filesAiKnowledgeService: FilesAiKnowledgeService,
    private readonly filesAiTranslateService: FilesAiTranslateService,
    private readonly filesAiMathService: FilesAiMathService,
    private readonly filesAiChatSessionService: FilesAiChatSessionService,
  ) {}

  /** 懒获取文件预览某模式的对话（落盘历史） */
  @Get(':id/ai/chat-sessions/:mode')
  getChatSession(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Param('mode') mode: string,
  ) {
    return this.filesAiChatSessionService.getOrCreateSession(
      user.id,
      fileId,
      mode,
    );
  }

  /** 清空该模式对话消息 */
  @Delete(':id/ai/chat-sessions/:mode')
  clearChatSession(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Param('mode') mode: string,
  ) {
    return this.filesAiChatSessionService.clearSession(user.id, fileId, mode);
  }

  /** 追加一条消息（流式成功后由前端落库） */
  @Post(':id/ai/chat-sessions/:mode/messages')
  appendChatMessage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Param('mode') mode: string,
    @Body() body: AppendFileAiChatMessageDto,
  ) {
    return this.filesAiChatSessionService.appendMessage(
      user.id,
      fileId,
      mode,
      body,
    );
  }

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

  /** 划词翻译（流式，F-11） */
  @Post(':id/ai/translate')
  async translateSelection(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesAiTranslateService.translate(
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

  /** 获取索引提取的近似全文（由 chunks 去 overlap 拼接），供图片 OCR 划词面板使用。 */
  @Get(':id/ai/extracted-text')
  getExtractedText(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesAiIndexService.getExtractedText(user.id, fileId);
  }

  /** 读取已入库的结构化摘要（索引 ready 后） */
  @Get(':id/ai/summary')
  getSummary(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Query('type') type?: string,
    @Query('chapterNo') chapterNo?: string,
  ): Promise<DocumentSummaryResponse> {
    const parsedChapterNo =
      chapterNo != null && chapterNo !== '' ? Number(chapterNo) : undefined;
    return this.filesAiSummaryService.getSummary(user.id, fileId, {
      type: type as 'book' | 'chapter' | 'chunk' | undefined,
      chapterNo: parsedChapterNo,
    });
  }

  /** 读取已入库的学术知识卡片（academic + ready 后） */
  @Get(':id/ai/knowledge')
  getKnowledge(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ): Promise<DocumentKnowledgeResponse> {
    return this.filesAiKnowledgeService.getKnowledge(user.id, fileId);
  }

  /** 截图数学解题（流式，F-27；仅网盘图片） */
  @Post(':id/ai/solve-math')
  async solveMath(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesAiMathService.solveMath(req, res, user.id, fileId, body);
  }

  /** 获取带时间轴的转写文稿（音频索引分句） */
  @Get(':id/ai/transcript')
  getTranscript(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesAiIndexService.getTranscript(user.id, fileId);
  }
}
