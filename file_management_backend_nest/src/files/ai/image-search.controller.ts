import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { ImageSearchService } from '@/files/ai/image-search.service';

/** 查询图走内存，避免临时落盘 */
const imageSearchUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//i.test(file.mimetype || '');
    if (ok) {
      cb(null, true);
      return;
    }
    cb(new Error('仅支持图片文件'), false);
  },
};

@Controller('ai/image-search')
export class ImageSearchController {
  constructor(private readonly imageSearchService: ImageSearchService) {}

  /** 上传一张图，在网盘图片中按视觉相似度检索 */
  @Post('by-image')
  @UseInterceptors(FileInterceptor('file', imageSearchUploadOptions))
  async byImage(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Query() query: Record<string, unknown>,
  ) {
    const data = await this.imageSearchService.searchByImage(
      user.id,
      file,
      query,
    );
    return { success: true, data };
  }
}
