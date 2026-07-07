import {
  Body,
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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { ShareService } from './share.service';

@Controller('shares')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Get('mine')
  listMyShares(@CurrentUser() user: RequestUser) {
    return this.shareService.listMyShares(user.id);
  }

  @Public()
  @Get('public/:shareCode')
  getPublicShareMeta(@Param('shareCode') shareCode: string) {
    return this.shareService.getPublicShareMeta(shareCode);
  }

  @Public()
  @Post('public/:shareCode/access')
  @HttpCode(HttpStatus.OK)
  accessPublicShare(
    @Param('shareCode') shareCode: string,
    @Req() req: Request,
    @Body() body: { extractCode?: string },
  ) {
    return this.shareService.accessPublicShare(shareCode, req, body);
  }

  @Public()
  @Get('public/:shareCode/file/:userFileId/download')
  downloadSharedFile(
    @Param('shareCode') shareCode: string,
    @Param('userFileId', ParseIntPipe) userFileId: number,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ) {
    return this.shareService.downloadSharedFile(
      shareCode,
      userFileId,
      req,
      res,
    );
  }

  @Get(':shareId/access-logs')
  getShareAccessLogs(
    @CurrentUser() user: RequestUser,
    @Param('shareId', ParseIntPipe) shareId: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Math.max(1, parseInt(String(page ?? '1'), 10) || 1);
    const ps = Math.min(
      100,
      Math.max(1, parseInt(String(pageSize ?? '20'), 10) || 20),
    );
    return this.shareService.getShareAccessLogs(user.id, shareId, p, ps);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createShare(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      userFileIds?: unknown;
      validity?: unknown;
      extractMode?: unknown;
      customExtract?: unknown;
      autoFillExtract?: unknown;
      maxVisitors?: unknown;
    },
  ) {
    return this.shareService.createShare(user.id, body);
  }
}
