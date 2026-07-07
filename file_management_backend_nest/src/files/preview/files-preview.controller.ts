import { Controller, Get, Param, ParseIntPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesPreviewService } from './files-preview.service';

@Controller('files')
export class FilesPreviewController {
  constructor(private readonly filesPreviewService: FilesPreviewService) {}

  @Get(':id/preview')
  async previewFile(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesPreviewService.previewOfficeFile(req, res, user.id, fileId);
  }

  @Get(':id/preview-state')
  async getOfficePreviewState(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesPreviewService.getOfficePreviewState(res, user.id, fileId);
  }

  @Get(':id/preview-status')
  async getOfficePreviewStatus(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.filesPreviewService.getOfficePreviewState(res, user.id, fileId);
  }
}
