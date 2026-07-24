import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { chunkUploadOptions, fileUploadOptions } from './file-upload.options';
import { FilesUploadService } from './files-upload.service';

@Controller('files')
export class FilesUploadController {
  constructor(private readonly filesUploadService: FilesUploadService) {}

  @Post('check-exists')
  @HttpCode(HttpStatus.OK)
  checkFileExists(@Body() body: { fileHash?: string }) {
    return this.filesUploadService.checkFileExists(body.fileHash ?? '');
  }

  @Post('check-name')
  @HttpCode(HttpStatus.OK)
  checkFileName(
    @CurrentUser() user: RequestUser,
    @Body() body: { fileName?: unknown; parentId?: unknown; type?: unknown },
  ) {
    return this.filesUploadService.checkFileName(user.id, body);
  }

  @Post('upload-chunk')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('chunk', chunkUploadOptions))
  uploadChunk(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.filesUploadService.uploadChunk(user.id, file, body);
  }

  @Get('chunks/:fileHash')
  getUploadedChunks(
    @CurrentUser() user: RequestUser,
    @Param('fileHash') fileHash: string,
  ) {
    return this.filesUploadService.getUploadedChunks(user.id, fileHash);
  }

  @Post('merge-chunks')
  @HttpCode(HttpStatus.CREATED)
  mergeChunks(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.filesUploadService.mergeChunks(req, user.id, body);
  }

  @Post('instant-upload')
  @HttpCode(HttpStatus.CREATED)
  instantUpload(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.filesUploadService.instantUpload(req, user.id, body);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  uploadFile(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { parentId?: unknown },
  ) {
    return this.filesUploadService.uploadFile(
      req,
      user.id,
      file,
      body.parentId,
    );
  }

  @Post('folder')
  @HttpCode(HttpStatus.CREATED)
  createFolder(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: { name?: unknown; parentId?: unknown },
  ) {
    return this.filesUploadService.createFolder(req, user.id, body);
  }
}
