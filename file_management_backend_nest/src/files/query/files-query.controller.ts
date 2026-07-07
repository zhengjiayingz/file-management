import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  Body,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesQueryService } from './files-query.service';

@Controller('files')
export class FilesQueryController {
  constructor(private readonly filesQueryService: FilesQueryService) {}

  @Get()
  getFiles(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.filesQueryService.getFiles(user.id, query);
  }

  @Post('batch/download-zip')
  @HttpCode(HttpStatus.OK)
  async downloadBatchAsZip(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Body() body: { ids?: unknown },
  ) {
    await this.filesQueryService.downloadBatchAsZip(req, res, user.id, body);
  }

  @Get(':id/download')
  async downloadFile(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    await this.filesQueryService.downloadFile(req, res, user.id, fileId);
  }

  @Get(':id/thumbnail')
  async getFileThumbnail(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    await this.filesQueryService.getFileThumbnail(req, res, user.id, fileId);
  }

  @Get(':id/text-chunk')
  getTextFileChunk(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Query() query: Record<string, unknown>,
  ) {
    return this.filesQueryService.getTextFileChunk(user.id, fileId, query);
  }

  @Get(':id')
  getFileById(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesQueryService.getFileById(user.id, fileId);
  }
}
