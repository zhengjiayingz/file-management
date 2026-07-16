import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { KnowledgeBasesService } from '../service/knowledge-bases.service';
import { KnowledgeBasesChatService } from '../service/knowledge-bases-chat.service';
import { KnowledgeBasesSessionService } from '../service/knowledge-bases-session.service';
import type { Request, Response } from 'express';

@Controller('knowledge-bases')
export class KnowledgeBasesController {
  constructor(
    private readonly knowledgeBasesService: KnowledgeBasesService,
    private readonly knowledgeBasesChatService: KnowledgeBasesChatService,
    private readonly knowledgeBasesSessionService: KnowledgeBasesSessionService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.knowledgeBasesService.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: RequestUser,
    @Body() body: { name?: unknown; description?: unknown },
  ) {
    return this.knowledgeBasesService.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: unknown; description?: unknown },
  ) {
    return this.knowledgeBasesService.update(user.id, id, body);
  }

  @Get(':id/items')
  listItems(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.knowledgeBasesService.listItems(user.id, id);
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  addItem(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userFileId?: unknown },
  ) {
    return this.knowledgeBasesService.addItem(user.id, id, body);
  }

  @Delete(':id/items/:fileId')
  removeItem(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    return this.knowledgeBasesService.removeItem(user.id, id, fileId);
  }

  /** 列出知识库会话 */
  @Get(':id/sessions')
  listSessions(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.knowledgeBasesSessionService.listSessions(user.id, id);
  }

  /** 列出某会话消息 */
  @Get(':id/sessions/:sessionId/messages')
  listMessages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.knowledgeBasesSessionService.listMessages(
      user.id,
      id,
      sessionId,
    );
  }

  /** 删除会话（含其消息）——须写在 DELETE :id 之前 */
  @Delete(':id/sessions/:sessionId')
  removeSession(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.knowledgeBasesSessionService.removeSession(
      user.id,
      id,
      sessionId,
    );
  }

  /** 查询知识库索引聚合状态（readyCount / canAsk / 未就绪文件） */
  @Get(':id/index-status')
  getIndexStatus(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.knowledgeBasesService.getIndexStatus(user.id, id);
  }

  /** 知识库流式问答：正文 text/plain 流；sessionId/citations 在响应头 */
  @Post(':id/chat')
  async chat(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.knowledgeBasesChatService.chat(req, res, user.id, id, body);
  }

  /** 删除知识库本体（短路径放最后，避免抢先匹配子资源） */
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.knowledgeBasesService.remove(user.id, id);
  }
}
