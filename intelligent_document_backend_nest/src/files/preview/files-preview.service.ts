import { exec, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import {
  LogOperationType,
  LogResourceType,
  OperationLogService,
} from '@/operation-log/operation-log.service';
import { resolveStorageFilePath } from '../utils/storagePath.utils';
import { ensureDirectoryExists } from '../utils/file.utils';
import { getPreviewsRootDir } from './preview-path.utils';
import { PreviewQueueService } from './preview-queue.service';
import type {
  PreviewConvertJobData,
  PreviewConvertJobResult,
  PreviewJobInfo,
} from './preview-queue.types';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = ['.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp'];

const SOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'soffice',
];

const CONVERSION_TIMEOUT_MIN_MS = 60_000;
const CONVERSION_TIMEOUT_MAX_MS = 600_000;
const CONVERSION_TIMEOUT_PER_MB_MS = 45_000;

const PPT_FULL_CONVERSION_MAX_MS = (() => {
  const n = parseInt(
    String(process.env.PPT_FULL_CONVERSION_MAX_MS || '2700000'),
    10,
  );
  if (Number.isFinite(n) && n >= 300_000 && n <= 3_600_000) return n;
  return 2_700_000;
})();

const PPT_PREVIEW_FIRST_SLIDES = (() => {
  const n = parseInt(String(process.env.PPT_PREVIEW_FIRST_SLIDES || '25'), 10);
  if (Number.isFinite(n) && n >= 3 && n <= 200) return n;
  return 25;
})();

const PPT_PREVIEW_MAX_SLIDES = (() => {
  const n = parseInt(String(process.env.PPT_PREVIEW_MAX_SLIDES || '200'), 10);
  if (Number.isFinite(n) && n >= PPT_PREVIEW_FIRST_SLIDES && n <= 500) return n;
  return 200;
})();

const PPT_PARTIAL_TIMEOUT_MS = Math.min(240_000, CONVERSION_TIMEOUT_MAX_MS);

export type ConvertToPdfResult = { path: string; phase: 'full' | 'partial' };

export type PreviewQueueStatus = {
  queueAvailable: boolean;
  nextBatchTarget: number | null;
  jobs: {
    partial: PreviewJobInfo;
    partialMore: PreviewJobInfo;
    full: PreviewJobInfo;
  };
};

type PartialPreviewMeta = {
  availableSlides: number;
  reachedEnd: boolean;
  updatedAt: string;
};

const partialInFlight = new Map<string, Promise<ConvertToPdfResult>>();

function getConversionTimeoutMs(fileSizeBytes: number): number {
  const mb = fileSizeBytes / (1024 * 1024);
  const extra = Math.ceil(mb) * CONVERSION_TIMEOUT_PER_MB_MS;
  return Math.min(
    CONVERSION_TIMEOUT_MAX_MS,
    Math.max(CONVERSION_TIMEOUT_MIN_MS, extra + 30_000),
  );
}

function findSofficePath(): string | null {
  for (const p of SOFFICE_PATHS) {
    if (path.isAbsolute(p)) {
      if (fs.existsSync(p)) return p;
    } else {
      return p;
    }
  }
  return null;
}

function isImpressFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.ppt' || ext === '.pptx' || ext === '.odp';
}

function getPreviewCachePath(fileHash: string): string {
  return path.join(getPreviewsRootDir(), `${fileHash}-preview.pdf`);
}

function getPreviewPartialPath(fileHash: string): string {
  return path.join(getPreviewsRootDir(), `${fileHash}-preview-partial.pdf`);
}

function getPreviewPartialMetaPath(fileHash: string): string {
  return path.join(
    getPreviewsRootDir(),
    `${fileHash}-preview-partial.meta.json`,
  );
}

function readPartialMeta(fileHash: string): PartialPreviewMeta | null {
  const metaPath = getPreviewPartialMetaPath(fileHash);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(
      fs.readFileSync(metaPath, 'utf8'),
    ) as PartialPreviewMeta;
    if (typeof raw.availableSlides === 'number' && raw.availableSlides > 0) {
      return raw;
    }
  } catch {
    // ignore
  }
  return null;
}

function writePartialMeta(fileHash: string, meta: PartialPreviewMeta): void {
  ensureDirectoryExists(getPreviewsRootDir());
  fs.writeFileSync(
    getPreviewPartialMetaPath(fileHash),
    JSON.stringify(meta),
    'utf8',
  );
}

function countPdfPages(pdfPath: string): number {
  try {
    const text = fs.readFileSync(pdfPath).toString('latin1');
    const countMatch = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
    if (countMatch) {
      const n = parseInt(countMatch[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const pageMatches = text.match(/\/Type\s*\/Page(?![s])/g);
    return pageMatches?.length ?? 0;
  } catch {
    return 0;
  }
}

const cleanupStaleProcesses = (): Promise<void> => {
  return new Promise((resolve) => {
    exec('taskkill /F /IM soffice.bin /T 2>NUL', { windowsHide: true }, () =>
      resolve(),
    );
  });
};

const buildImpressPartialConvertToArg = (slideCount: number): string => {
  const filterObj = {
    PageRange: { type: 'string', value: `1-${slideCount}` },
  };
  return `pdf:impress_pdf_Export:${JSON.stringify(filterObj)}`;
};

function findPdfInDir(dir: string, baseHint: string): string | null {
  const expect = path.join(dir, `${baseHint}.pdf`);
  if (fs.existsSync(expect)) return expect;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'));
  if (files.length === 0) return null;
  return path.join(dir, files[0]);
}

@Injectable()
export class FilesPreviewService {
  private readonly logger = new Logger(FilesPreviewService.name);

  constructor(
    private readonly previewQueue: PreviewQueueService,
    private readonly prisma: PrismaService,
    private readonly operationLogService: OperationLogService,
  ) {}

  isOfficeFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  isPreviewQueueAvailable(): boolean {
    return this.previewQueue.isPreviewQueueAvailable();
  }

  checkLibreOfficeInstallation(): { installed: boolean; path: string | null } {
    const p = findSofficePath();
    return { installed: p !== null, path: p };
  }

  getAvailablePartialSlides(fileHash: string): number | null {
    const partialPath = getPreviewPartialPath(fileHash);
    if (!fs.existsSync(partialPath)) return null;
    const meta = readPartialMeta(fileHash);
    if (meta) return meta.availableSlides;
    const pages = countPdfPages(partialPath);
    return pages > 0 ? pages : PPT_PREVIEW_FIRST_SLIDES;
  }

  getPreviewFilePhase(fileHash: string): 'none' | 'partial' | 'full' {
    if (fs.existsSync(getPreviewCachePath(fileHash))) return 'full';
    if (fs.existsSync(getPreviewPartialPath(fileHash))) return 'partial';
    return 'none';
  }

  getPptPreviewFirstSlideCount(): number {
    return PPT_PREVIEW_FIRST_SLIDES;
  }

  async getPreviewQueueStatus(fileHash: string): Promise<PreviewQueueStatus> {
    const missing: PreviewJobInfo = { state: 'missing' };
    if (!this.previewQueue.isPreviewQueueAvailable()) {
      return {
        queueAvailable: false,
        nextBatchTarget: null,
        jobs: { partial: missing, partialMore: missing, full: missing },
      };
    }
    const nextBatchTarget = this.getNextPartialBatchTarget(fileHash);
    const [partial, full, partialMore] = await Promise.all([
      this.previewQueue.getPreviewJobInfo(fileHash, 'impress-partial'),
      this.previewQueue.getPreviewJobInfo(fileHash, 'full'),
      nextBatchTarget != null
        ? this.previewQueue.getPreviewJobInfo(
            fileHash,
            'impress-partial-more',
            nextBatchTarget,
          )
        : Promise.resolve(missing),
    ]);
    return {
      queueAvailable: true,
      nextBatchTarget,
      jobs: { partial, partialMore, full },
    };
  }

  async ensurePartialBatchScheduled(
    fileHash: string,
    sourceFilePath: string,
  ): Promise<void> {
    if (!this.previewQueue.isPreviewQueueAvailable()) return;
    if (this.getPreviewFilePhase(fileHash) !== 'partial') return;
    await this.scheduleNextPartialBatch(fileHash, sourceFilePath);
  }

  async convertToPdf(
    sourceFilePath: string,
    fileHash: string,
  ): Promise<ConvertToPdfResult> {
    const fullP = getPreviewCachePath(fileHash);
    if (fs.existsSync(fullP)) {
      return { path: fullP, phase: 'full' };
    }
    const base = path.basename(sourceFilePath);
    if (isImpressFile(base)) {
      const partP = getPreviewPartialPath(fileHash);
      if (fs.existsSync(partP)) {
        await this.scheduleNextPartialBatch(fileHash, sourceFilePath);
        await this.scheduleFullPptInBackgroundIfReady(fileHash, sourceFilePath);
        return { path: partP, phase: 'partial' };
      }
      const inFlight = partialInFlight.get(fileHash);
      if (inFlight) {
        return inFlight;
      }
      const pr = this.enqueueAndWait(
        {
          op: 'impress-partial',
          fileHash,
          sourceFilePath,
          isBackground: false,
        },
        PPT_PARTIAL_TIMEOUT_MS,
      );
      void pr.finally(() => partialInFlight.delete(fileHash));
      partialInFlight.set(fileHash, pr);
      return pr;
    }

    return this.enqueueAndWait(
      {
        op: 'full',
        fileHash,
        sourceFilePath,
        isBackground: false,
      },
      this.getFullConvertWaitTimeoutMs(sourceFilePath),
    );
  }

  private getNextPartialBatchTarget(fileHash: string): number | null {
    const meta = readPartialMeta(fileHash);
    if (meta?.reachedEnd) return null;
    const currentSlides =
      meta?.availableSlides ??
      this.getAvailablePartialSlides(fileHash) ??
      PPT_PREVIEW_FIRST_SLIDES;
    const nextTarget = currentSlides + PPT_PREVIEW_FIRST_SLIDES;
    if (nextTarget > PPT_PREVIEW_MAX_SLIDES) return null;
    return nextTarget;
  }

  private assertPreviewQueueReady(): void {
    if (!this.previewQueue.isPreviewQueueAvailable()) {
      throw new Error('REDIS_URL 未配置，Office 预览队列不可用');
    }
  }

  private async enqueueAndWait(
    data: PreviewConvertJobData,
    timeoutMs: number,
  ): Promise<ConvertToPdfResult> {
    this.assertPreviewQueueReady();
    const job = await this.previewQueue.enqueuePreviewJob(data);
    if (!job.id) {
      throw new Error('预览任务入队失败：未获得 jobId');
    }
    return this.previewQueue.waitPreviewJobFinished(job.id, timeoutMs);
  }

  private getFullConvertWaitTimeoutMs(sourceFilePath: string): number {
    if (!fs.existsSync(sourceFilePath)) {
      return CONVERSION_TIMEOUT_MAX_MS;
    }
    const baseName = path.basename(sourceFilePath);
    if (isImpressFile(baseName)) {
      const st = fs.statSync(sourceFilePath);
      const mb = st.size / (1024 * 1024);
      const bySize = Math.ceil(mb) * CONVERSION_TIMEOUT_PER_MB_MS + 30_000;
      return Math.min(
        PPT_FULL_CONVERSION_MAX_MS,
        Math.max(CONVERSION_TIMEOUT_MIN_MS, bySize),
      );
    }
    return getConversionTimeoutMs(fs.statSync(sourceFilePath).size);
  }

  private async deferWaitingFullJob(fileHash: string): Promise<void> {
    const state = await this.previewQueue.getPreviewJobState(fileHash, 'full');
    if (state !== 'waiting' && state !== 'delayed' && state !== 'prioritized') {
      return;
    }
    try {
      const job = await this.previewQueue
        .getPreviewQueue()
        .getJob(this.previewQueue.buildPreviewJobId(fileHash, 'full'));
      if (job) await job.remove();
      this.logger.log(
        `[Preview] 快览扩展中，已推迟排队中的全文任务 fileHash=${fileHash}`,
      );
    } catch (err) {
      this.logger.warn(`[Preview] 推迟全文任务失败 fileHash=${fileHash}`, err);
    }
  }

  private async scheduleFullPptInBackground(
    fileHash: string,
    sourceFilePath: string,
  ): Promise<void> {
    if (fs.existsSync(getPreviewCachePath(fileHash))) return;

    const state = await this.previewQueue.getPreviewJobState(fileHash, 'full');
    if (
      state === 'waiting' ||
      state === 'active' ||
      state === 'delayed' ||
      state === 'prioritized'
    ) {
      return;
    }

    try {
      await this.previewQueue.enqueuePreviewJob({
        op: 'full',
        fileHash,
        sourceFilePath,
        isBackground: true,
      });
    } catch (err) {
      this.logger.warn(`[Preview] 后台全文入队失败 fileHash=${fileHash}`, err);
    }
  }

  private async tryScheduleFullAfterPartialExpansion(
    fileHash: string,
    sourceFilePath: string,
  ): Promise<void> {
    const meta = readPartialMeta(fileHash);
    if (
      !meta?.reachedEnd &&
      (meta?.availableSlides ?? 0) < PPT_PREVIEW_MAX_SLIDES
    ) {
      return;
    }
    await this.scheduleFullPptInBackground(fileHash, sourceFilePath);
  }

  private async scheduleNextPartialBatch(
    fileHash: string,
    sourceFilePath: string,
  ): Promise<void> {
    if (fs.existsSync(getPreviewCachePath(fileHash))) return;

    const partialPath = getPreviewPartialPath(fileHash);
    if (!fs.existsSync(partialPath)) return;

    let meta = readPartialMeta(fileHash);
    if (!meta) {
      const pages = countPdfPages(partialPath) || PPT_PREVIEW_FIRST_SLIDES;
      meta = {
        availableSlides: pages,
        reachedEnd: false,
        updatedAt: new Date().toISOString(),
      };
      writePartialMeta(fileHash, meta);
    }
    if (meta.reachedEnd) {
      await this.tryScheduleFullAfterPartialExpansion(fileHash, sourceFilePath);
      return;
    }

    await this.deferWaitingFullJob(fileHash);

    const nextTarget = meta.availableSlides + PPT_PREVIEW_FIRST_SLIDES;
    if (nextTarget > PPT_PREVIEW_MAX_SLIDES) {
      writePartialMeta(fileHash, {
        ...meta,
        reachedEnd: true,
        updatedAt: new Date().toISOString(),
      });
      await this.tryScheduleFullAfterPartialExpansion(fileHash, sourceFilePath);
      return;
    }

    const state = await this.previewQueue.getPreviewJobState(
      fileHash,
      'impress-partial-more',
      nextTarget,
    );
    if (
      state === 'waiting' ||
      state === 'active' ||
      state === 'delayed' ||
      state === 'prioritized'
    ) {
      return;
    }

    try {
      await this.previewQueue.enqueuePreviewJob({
        op: 'impress-partial-more',
        fileHash,
        sourceFilePath,
        targetSlides: nextTarget,
        isBackground: true,
      });
      this.logger.log(
        `[Preview] 已排入下一批快览 fileHash=${fileHash} nextTarget=${nextTarget}`,
      );
    } catch (err) {
      this.logger.warn(
        `[Preview] 快览分批入队失败 fileHash=${fileHash} nextTarget=${nextTarget}`,
        err,
      );
    }
  }

  private async scheduleFullPptInBackgroundIfReady(
    fileHash: string,
    sourceFilePath: string,
  ): Promise<void> {
    await this.tryScheduleFullAfterPartialExpansion(fileHash, sourceFilePath);
  }

  /** 快览分批未完成时，后台全文任务应让路（Worker 用） */
  shouldDeferFullConversion(fileHash: string): boolean {
    if (fs.existsSync(getPreviewCachePath(fileHash))) return false;
    const partialPath = getPreviewPartialPath(fileHash);
    if (!fs.existsSync(partialPath)) return false;
    const meta = readPartialMeta(fileHash);
    if (meta?.reachedEnd) return false;
    const available = meta?.availableSlides ?? countPdfPages(partialPath);
    return available > 0 && available < PPT_PREVIEW_MAX_SLIDES;
  }

  /** BullMQ Worker 消费入口 */
  async processPreviewConvertJob(
    data: PreviewConvertJobData,
  ): Promise<PreviewConvertJobResult> {
    if (data.op === 'impress-partial') {
      try {
        const p = await this.doImpressPartial(data.sourceFilePath, data.fileHash);
        if (!fs.existsSync(getPreviewCachePath(data.fileHash))) {
          await this.scheduleNextPartialBatch(data.fileHash, data.sourceFilePath);
        }
        return { path: p, phase: 'partial' };
      } catch (partialErr) {
        this.logger.warn(
          `[Preview] 部分页 PPT 转换失败，回退为全文 fileHash=${data.fileHash}`,
          partialErr,
        );
        const p = await this.doFullConvert(data.sourceFilePath, data.fileHash);
        return { path: p, phase: 'full' };
      }
    }

    if (data.op === 'impress-partial-more') {
      const targetSlides =
        data.targetSlides ?? PPT_PREVIEW_FIRST_SLIDES * 2;
      const partialPath = getPreviewPartialPath(data.fileHash);
      const prevMeta = readPartialMeta(data.fileHash);
      const prevCount = prevMeta?.availableSlides ?? countPdfPages(partialPath);

      if (
        fs.existsSync(getPreviewCachePath(data.fileHash)) ||
        prevMeta?.reachedEnd
      ) {
        return { path: partialPath, phase: 'partial' };
      }

      try {
        await this.doImpressPartial(
          data.sourceFilePath,
          data.fileHash,
          targetSlides,
          true,
        );
        const newCount = countPdfPages(partialPath) || prevCount;

        if (newCount <= prevCount) {
          writePartialMeta(data.fileHash, {
            availableSlides: prevCount,
            reachedEnd: true,
            updatedAt: new Date().toISOString(),
          });
          this.logger.log(
            `[Preview] 快览已触顶 fileHash=${data.fileHash} slides=${prevCount}`,
          );
          await this.tryScheduleFullAfterPartialExpansion(
            data.fileHash,
            data.sourceFilePath,
          );
        } else {
          writePartialMeta(data.fileHash, {
            availableSlides: newCount,
            reachedEnd: false,
            updatedAt: new Date().toISOString(),
          });
          this.logger.log(
            `[Preview] 快览分批扩展完成 fileHash=${data.fileHash} slides=${newCount}`,
          );
          await this.scheduleNextPartialBatch(data.fileHash, data.sourceFilePath);
        }
        return { path: partialPath, phase: 'partial' };
      } catch (err) {
        this.logger.warn(
          `[Preview] 快览分批扩展失败 fileHash=${data.fileHash}`,
          err,
        );
        throw err;
      }
    }

    if (data.op === 'full') {
      const p = await this.doFullConvert(data.sourceFilePath, data.fileHash);
      if (data.isBackground) {
        this.logger.log(`[Preview] 后台全文 PDF 已就绪 fileHash=${data.fileHash}`);
      }
      return { path: p, phase: 'full' };
    }

    throw new Error(`未知预览操作: ${data.op}`);
  }

  async doFullConvert(
    sourceFilePath: string,
    fileHash: string,
  ): Promise<string> {
    const sofficePath = findSofficePath();
    if (!sofficePath) {
      throw new Error(
        'LibreOffice 未安装或未找到。请安装 LibreOffice 并确保路径正确。',
      );
    }
    await cleanupStaleProcesses();
    if (!fs.existsSync(sourceFilePath)) throw new Error('源文件不存在');

    const finalPath = getPreviewCachePath(fileHash);
    if (fs.existsSync(finalPath)) {
      return finalPath;
    }

    const previewsDir = getPreviewsRootDir();
    ensureDirectoryExists(previewsDir);
    const tempDir = path.join(
      previewsDir,
      `temp-${fileHash}-full-${Date.now()}`,
    );
    ensureDirectoryExists(tempDir);
    const st = fs.statSync(sourceFilePath);
    const baseName = path.basename(sourceFilePath);
    const mb = st.size / (1024 * 1024);
    const bySize = Math.ceil(mb) * CONVERSION_TIMEOUT_PER_MB_MS + 30_000;
    const conversionTimeoutMs = isImpressFile(baseName)
      ? Math.min(
          PPT_FULL_CONVERSION_MAX_MS,
          Math.max(CONVERSION_TIMEOUT_MIN_MS, bySize),
        )
      : getConversionTimeoutMs(st.size);
    const sourceBase = path.basename(
      sourceFilePath,
      path.extname(sourceFilePath),
    );

    try {
      await execFileAsync(
        sofficePath,
        [
          '--headless',
          '--norestore',
          '--nolockcheck',
          '--convert-to',
          'pdf',
          '--outdir',
          tempDir,
          sourceFilePath,
        ],
        {
          timeout: conversionTimeoutMs,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const pdfPath = findPdfInDir(tempDir, sourceBase);
      if (!pdfPath) {
        throw new Error('LibreOffice 未生成 PDF 文件，可能是文件格式不受支持');
      }
      fs.renameSync(pdfPath, finalPath);
      if (fs.existsSync(tempDir))
        fs.rmSync(tempDir, { recursive: true, force: true });
      const pPart = getPreviewPartialPath(fileHash);
      if (fs.existsSync(pPart)) {
        try {
          fs.unlinkSync(pPart);
        } catch {
          // ignore
        }
      }
      const metaPath = getPreviewPartialMetaPath(fileHash);
      if (fs.existsSync(metaPath)) {
        try {
          fs.unlinkSync(metaPath);
        } catch {
          // ignore
        }
      }
      return finalPath;
    } catch (error) {
      if (fs.existsSync(tempDir))
        fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  async doImpressPartial(
    sourceFilePath: string,
    fileHash: string,
    slideCount: number = PPT_PREVIEW_FIRST_SLIDES,
    allowOverwrite = false,
  ): Promise<string> {
    const sofficePath = findSofficePath();
    if (!sofficePath) {
      throw new Error(
        'LibreOffice 未安装或未找到。请安装 LibreOffice 并确保路径正确。',
      );
    }
    await cleanupStaleProcesses();
    if (!fs.existsSync(sourceFilePath)) throw new Error('源文件不存在');

    const outPath = getPreviewPartialPath(fileHash);
    const meta = readPartialMeta(fileHash);
    if (!allowOverwrite && fs.existsSync(outPath)) {
      if (!meta) {
        writePartialMeta(fileHash, {
          availableSlides: countPdfPages(outPath) || PPT_PREVIEW_FIRST_SLIDES,
          reachedEnd: false,
          updatedAt: new Date().toISOString(),
        });
      }
      return outPath;
    }
    if (
      allowOverwrite &&
      meta &&
      meta.availableSlides >= slideCount &&
      fs.existsSync(outPath)
    ) {
      return outPath;
    }

    const previewsDir = getPreviewsRootDir();
    ensureDirectoryExists(previewsDir);
    const tempDir = path.join(
      previewsDir,
      `temp-${fileHash}-partial-${Date.now()}`,
    );
    ensureDirectoryExists(tempDir);
    const sourceBase = path.basename(
      sourceFilePath,
      path.extname(sourceFilePath),
    );
    const convertTo = buildImpressPartialConvertToArg(slideCount);
    const extraSlides = Math.max(0, slideCount - PPT_PREVIEW_FIRST_SLIDES);
    const timeoutMs = Math.min(
      CONVERSION_TIMEOUT_MAX_MS,
      PPT_PARTIAL_TIMEOUT_MS + extraSlides * 4_000,
    );

    try {
      await execFileAsync(
        sofficePath,
        [
          '--headless',
          '--norestore',
          '--nolockcheck',
          '--convert-to',
          convertTo,
          '--outdir',
          tempDir,
          sourceFilePath,
        ],
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      );
      const gen = findPdfInDir(tempDir, sourceBase);
      if (!gen) {
        throw new Error(
          'LibreOffice 未生成部分页 PDF（PageRange 可能不受支持）',
        );
      }
      fs.renameSync(gen, outPath);
      if (fs.existsSync(tempDir))
        fs.rmSync(tempDir, { recursive: true, force: true });

      const availableSlides =
        countPdfPages(outPath) ||
        Math.min(slideCount, PPT_PREVIEW_FIRST_SLIDES);
      writePartialMeta(fileHash, {
        availableSlides,
        reachedEnd: false,
        updatedAt: new Date().toISOString(),
      });
      return outPath;
    } catch (error) {
      if (fs.existsSync(tempDir))
        fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  async previewOfficeFile(
    req: Request,
    res: Response,
    userId: number,
    fileId: number,
  ): Promise<void> {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      include: {
        storage: {
          select: { filePath: true, mimeType: true, fileHash: true },
        },
      },
    });

    if (!userFile?.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    if (!this.isOfficeFile(userFile.fileName)) {
      res.status(400).json({
        success: false,
        message: '该文件类型不支持 Office 预览',
      });
      return;
    }

    const installation = this.checkLibreOfficeInstallation();
    if (!installation.installed && !this.isPreviewQueueAvailable()) {
      res.status(500).json({
        success: false,
        message:
          'LibreOffice 未安装，无法进行文档预览。请联系管理员安装 LibreOffice。',
      });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ success: false, message: '文件源已丢失' });
      return;
    }

    try {
      const { path: pdfPath, phase: pdfPhase } = await this.convertToPdf(
        physicalPath,
        userFile.storage.fileHash,
      );

      await this.operationLogService.logOperation({
        req,
        userId,
        operationType: LogOperationType.DOWNLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: userFile.id,
        description: `Previewed office file: ${userFile.fileName}`,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(userFile.fileName.replace(/\.\w+$/, '.pdf'))}"`,
      );
      res.setHeader('X-Preview-Pdf-Phase', pdfPhase);
      res.removeHeader('X-Frame-Options');
      if (pdfPhase === 'partial') {
        res.setHeader('Cache-Control', 'private, no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', `"${userFile.storage.fileHash}-full"`);
      }
      res.sendFile(path.resolve(pdfPath));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`[Preview] Error: ${message}`);
      res.status(500).json({
        success: false,
        message: `文档预览失败: ${message}`,
      });
    }
  }

  async getOfficePreviewState(
    res: Response,
    userId: number,
    fileId: number,
  ): Promise<void> {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      include: {
        storage: { select: { filePath: true, fileHash: true } },
      },
    });

    if (!userFile?.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    if (!this.isOfficeFile(userFile.fileName)) {
      res.status(400).json({
        success: false,
        message: '该文件类型无预览状态',
      });
      return;
    }

    try {
      const fileHash = userFile.storage.fileHash;
      const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
      await this.ensurePartialBatchScheduled(fileHash, physicalPath);
      const [phase, queueStatus] = await Promise.all([
        Promise.resolve(this.getPreviewFilePhase(fileHash)),
        this.getPreviewQueueStatus(fileHash),
      ]);
      const availableSlides = this.getAvailablePartialSlides(fileHash);

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader(
        'ETag',
        `"preview-state-${fileHash}-${phase}-${availableSlides ?? 0}-${queueStatus.nextBatchTarget ?? 0}-${queueStatus.jobs.partialMore.state}"`,
      );
      res.json({
        success: true,
        phase,
        firstSlides: this.getPptPreviewFirstSlideCount(),
        availableSlides,
        nextBatchTarget: queueStatus.nextBatchTarget,
        queueAvailable: queueStatus.queueAvailable,
        jobs: queueStatus.jobs,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '查询失败';
      this.logger.error(`[Preview state] Error: ${message}`);
      res.status(500).json({ success: false, message });
    }
  }
}
