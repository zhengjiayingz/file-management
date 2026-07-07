import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesTagService } from './files-tag.service';

/** 标签路由须注册在 FilesQueryController 的 GET :id 之前，避免 id = "tags" */
@Controller('files')
export class FilesTagController {
  constructor(private readonly filesTagService: FilesTagService) {}

  @Get('tags')
  listTags(@CurrentUser() user: RequestUser) {
    return this.filesTagService.listTags(user.id);
  }

  @Post('tags')
  createTag(
    @CurrentUser() user: RequestUser,
    @Body() body: { tagName?: unknown; color?: unknown },
  ) {
    return this.filesTagService.createTag(user.id, body);
  }

  @Put('tags/:tagId')
  updateTag(
    @CurrentUser() user: RequestUser,
    @Param('tagId', ParseIntPipe) tagId: number,
    @Body() body: { tagName?: unknown; color?: unknown },
  ) {
    return this.filesTagService.updateTag(user.id, tagId, body);
  }

  @Delete('tags/:tagId')
  deleteTag(
    @CurrentUser() user: RequestUser,
    @Param('tagId', ParseIntPipe) tagId: number, // 取 req.params.tagId（Express 里的路径参数）
  ) {
    return this.filesTagService.deleteTag(user.id, tagId);
  }

  @Put(':id/tags')
  setFileTags(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: { tagIds?: unknown },
  ) {
    return this.filesTagService.setFileTags(user.id, fileId, body.tagIds);
  }
}
