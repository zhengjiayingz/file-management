import { Module } from '@nestjs/common';
import { PasswordPolicyService } from '../common/password-policy/password-policy.service';
import { StorageModule } from '../storage/storage.module';
import { FilesAiController } from './ai/files-ai.controller';
import { FilesAiService } from './ai/files-ai.service';
import { FilesPreviewController } from './preview/files-preview.controller';
import { FilesPreviewService } from './preview/files-preview.service';
import { PreviewQueueService } from './preview/preview-queue.service';
import { FilesManageController } from './manage/files-manage.controller';
import { FilesManageService } from './manage/files-manage.service';
import { FileBatchHelper } from './helpers/file-batch.helper';
import { FilesQueryController } from './query/files-query.controller';
import { FilesQueryService } from './query/files-query.service';
import { FilesTagController } from './tag/files-tag.controller';
import { FilesTagService } from './tag/files-tag.service';
import { OperationLogService } from '../operation-log/operation-log.service';

@Module({
  imports: [StorageModule],
  controllers: [
    FilesTagController,
    FilesAiController,
    FilesPreviewController,
    FilesQueryController,
    FilesManageController,
  ],
  providers: [
    FilesQueryService,
    FilesManageService,
    FilesTagService,
    FilesAiService,
    FilesPreviewService,
    PreviewQueueService,
    FileBatchHelper,
    OperationLogService,
    PasswordPolicyService,
  ],
})
export class FilesModule {}
