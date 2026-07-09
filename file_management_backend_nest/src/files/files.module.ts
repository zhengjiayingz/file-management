import { Module } from '@nestjs/common';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { PasswordPolicyService } from '../common/password-policy/password-policy.service';
import { ShareModule } from '../share/share.module';
import { StorageModule } from '../storage/storage.module';
import { FilesUploadController } from './upload/files-upload.controller';
import { FilesUploadService } from './upload/files-upload.service';
import { MergeUploadService } from './upload/merge-upload.service';
import { FilesVersionController } from './version/files-version.controller';
import { FilesVersionService } from './version/files-version.service';
import { FilesArchiveController } from './archive/files-archive.controller';
import { FilesArchiveService } from './archive/files-archive.service';
import { DocumentIndexQueueService } from '@/files/ai/document-index-queue.service';
import { FilesAiController } from '@/files/ai/files-ai.controller';
import { FilesAiIndexService } from '@/files/ai/files-ai-index.service';
import { FilesAiService } from '@/files/ai/files-ai.service';
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
import { FilesAiRagService } from '@/files/ai/files-ai-rag.service';

@Module({
  imports: [StorageModule, ShareModule, OperationLogModule],
  controllers: [
    FilesUploadController,
    FilesTagController,
    FilesVersionController,
    FilesArchiveController,
    FilesAiController,
    FilesPreviewController,
    FilesQueryController,
    FilesManageController,
  ],
  providers: [
    FilesUploadService,
    MergeUploadService,
    FilesVersionService,
    FilesArchiveService,
    FilesQueryService,
    FilesManageService,
    FilesTagService,
    FilesAiService,
    FilesAiIndexService,
    FilesAiRagService,
    DocumentIndexQueueService,
    FilesPreviewService,
    PreviewQueueService,
    FileBatchHelper,
    PasswordPolicyService,
  ],
})
export class FilesModule {}
