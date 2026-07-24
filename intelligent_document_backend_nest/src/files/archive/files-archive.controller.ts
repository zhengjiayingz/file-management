import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesArchiveService } from './files-archive.service';

@Controller('files')
export class FilesArchiveController {
  constructor(private readonly filesArchiveService: FilesArchiveService) {}

  @Get(':id/archive/entries')
  listArchiveEntries(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesArchiveService.listArchiveEntries(user.id, fileId);
  }

  @Post(':id/archive/conflicts')
  @HttpCode(HttpStatus.OK)
  checkArchiveExtractConflicts(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: { parentId?: unknown; paths?: unknown },
  ) {
    return this.filesArchiveService.checkArchiveExtractConflicts(
      user.id,
      fileId,
      body,
    );
  }

  @Post(':id/archive/extract')
  @HttpCode(HttpStatus.OK)
  extractArchiveToDrive(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body()
    body: {
      parentId?: unknown;
      paths?: unknown;
      conflictAction?: unknown;
    },
  ) {
    return this.filesArchiveService.extractArchiveToDrive(
      req,
      user.id,
      fileId,
      body,
    );
  }
}
