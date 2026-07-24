import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesManageService } from './files-manage.service';

@Controller('files')
export class FilesManageController {
  constructor(private readonly filesManageService: FilesManageService) {}

  @Post('batch/delete')
  @HttpCode(HttpStatus.OK)
  deleteFilesBatch(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: { ids?: unknown },
  ) {
    return this.filesManageService.deleteFilesBatch(req, user.id, body.ids);
  }

  @Post('batch/restore')
  @HttpCode(HttpStatus.OK)
  restoreFilesBatch(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: { ids?: unknown },
  ) {
    return this.filesManageService.restoreFilesBatch(req, user.id, body.ids);
  }

  @Post('batch/move')
  @HttpCode(HttpStatus.OK)
  moveFilesBatch(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: { ids?: unknown; parentId?: unknown },
  ) {
    return this.filesManageService.moveFilesBatch(
      req,
      user.id,
      body.ids,
      body.parentId,
    );
  }

  @Post('batch/permanent-delete')
  @HttpCode(HttpStatus.OK)
  permanentDeleteFilesBatch(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: { ids?: unknown },
  ) {
    return this.filesManageService.permanentDeleteFilesBatch(
      req,
      user.id,
      body.ids,
    );
  }

  @Put(':id/rename')
  renameFile(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: { name?: string },
  ) {
    return this.filesManageService.renameFile(
      req,
      user.id,
      fileId,
      body.name || '',
    );
  }

  @Put(':id/move')
  moveFile(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body() body: { parentId?: unknown },
  ) {
    return this.filesManageService.moveFile(
      req,
      user.id,
      fileId,
      body.parentId,
    );
  }

  @Delete(':id')
  deleteFile(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesManageService.deleteFile(req, user.id, fileId);
  }

  @Post(':id/save-to-my-drive')
  @HttpCode(HttpStatus.OK)
  saveSharedFileToMyDrive(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
    @Body()
    body: {
      parentId?: unknown;
      shareCode?: unknown;
      extractCode?: unknown;
    },
  ) {
    return this.filesManageService.saveSharedFileToMyDrive(
      req,
      user.id,
      fileId,
      body,
    );
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restoreFile(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesManageService.restoreFile(req, user.id, fileId);
  }

  @Delete(':id/permanent')
  permanentDeleteFile(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) fileId: number,
  ) {
    return this.filesManageService.permanentDeleteFile(req, user.id, fileId);
  }
}
