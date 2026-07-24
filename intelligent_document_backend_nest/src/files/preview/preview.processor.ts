import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { DelayedError, Job } from 'bullmq';
import { FilesPreviewService } from './files-preview.service';
import {
  PREVIEW_JOB_NAME,
  PREVIEW_QUEUE_NAME,
  type PreviewConvertJobData,
  type PreviewConvertJobResult,
} from './preview-queue.types';

@Processor(PREVIEW_QUEUE_NAME, { concurrency: 1 })
export class PreviewProcessor extends WorkerHost {
  private readonly logger = new Logger(PreviewProcessor.name);

  constructor(private readonly previewService: FilesPreviewService) {
    super();
  }

  async process(
    job: Job<PreviewConvertJobData, PreviewConvertJobResult>,
  ): Promise<PreviewConvertJobResult> {
    if (job.name !== PREVIEW_JOB_NAME) {
      throw new Error(`未知预览任务类型: ${job.name}`);
    }

    if (
      job.data.op === 'full' &&
      job.data.isBackground &&
      this.previewService.shouldDeferFullConversion(job.data.fileHash)
    ) {
      this.logger.log(
        `[preview-worker] 快览分批未完成，推迟全文 jobId=${job.id}`,
      );
      await this.previewService.ensurePartialBatchScheduled(
        job.data.fileHash,
        job.data.sourceFilePath,
      );
      await job.moveToDelayed(Date.now() + 20_000);
      throw new DelayedError();
    }

    this.logger.log(
      `[preview-worker] 开始 op=${job.data.op} fileHash=${job.data.fileHash}`,
    );
    const result = await this.previewService.processPreviewConvertJob(job.data);
    this.logger.log(
      `[preview-worker] 完成 op=${job.data.op} phase=${result.phase}`,
    );
    return result;
  }
}
