import { Controller, Post } from '@nestjs/common';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { FilesDuplicatesService } from '@/files/duplicates/files-duplicates.service';

@Controller('files/duplicates')
export class FilesDuplicatesController {
  constructor(private readonly duplicatesService: FilesDuplicatesService) {}

  /** 扫描当前用户网盘中的完全重复文件（同一 content hash） */
  @Post('scan')
  async scan(@CurrentUser() user: RequestUser) {
    const data = await this.duplicatesService.scan(user.id);
    return { success: true, data };
  }
}
