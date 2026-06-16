import { exec, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { ensureDirectoryExists } from '../utils/file.utils.js';
import {
  enqueuePreviewJob,
  getPreviewJobInfo,
  getPreviewJobState,
  getPreviewQueue,
  isPreviewQueueAvailable,
  waitPreviewJobFinished,
  buildPreviewJobId,
  type PreviewConvertJobData,
  type PreviewConvertJobResult,
  type PreviewJobInfo,
} from '../queues/preview.queue.js';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Office 文档预览服务
 * 使用 LibreOffice 将 Word/PPT 文档转换为 PDF，实现在线预览
 * PPT/ODP：先转前若干页为「快速稿」，全文在后台继续转；Word 等仍为一次性全文
 * Excel 文件由前端直接下载，不走预览流程
 */

const SUPPORTED_EXTENSIONS = ['.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp'];

const SOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'soffice',
];

const PREVIEWS_DIR = path.join(process.cwd(), 'previews');

const CONVERSION_TIMEOUT_MIN_MS = 60_000;
/** 普通 Office 转 PDF 单次上限（Writer 等） */
const CONVERSION_TIMEOUT_MAX_MS = 600_000;
const CONVERSION_TIMEOUT_PER_MB_MS = 45_000;

/**
 * 全文 PPT/ODP 转 PDF 更耗时，不应用 10 分钟硬顶（否则大文件后台全文易超时，前端永远只显示快览 25 页）
 * 可用环境变量 PPT_FULL_CONVERSION_MAX_MS 覆盖，默认 45 分钟
 */
const PPT_FULL_CONVERSION_MAX_MS = (() => {
  const n = parseInt(String(process.env.PPT_FULL_CONVERSION_MAX_MS || '2700000'), 10);
  if (Number.isFinite(n) && n >= 300_000 && n <= 3_600_000) return n;
  return 2_700_000;
})();

/** Impress 先转前 N 页为 PDF（可设环境变量 PPT_PREVIEW_FIRST_SLIDES，默认 25） */
const PPT_PREVIEW_FIRST_SLIDES = (() => {
  const n = parseInt(String(process.env.PPT_PREVIEW_FIRST_SLIDES || '25'), 10);
  if (Number.isFinite(n) && n >= 3 && n <= 200) return n;
  return 25;
})();

/** 快览分批扩展的上限（页数），默认 200 */
const PPT_PREVIEW_MAX_SLIDES = (() => {
  const n = parseInt(String(process.env.PPT_PREVIEW_MAX_SLIDES || '200'), 10);
  if (Number.isFinite(n) && n >= PPT_PREVIEW_FIRST_SLIDES && n <= 500) return n;
  return 200;
})();

/** 仅前 N 页转换：超时单独放宽但不宜过长 */
const PPT_PARTIAL_TIMEOUT_MS = Math.min(240_000, CONVERSION_TIMEOUT_MAX_MS);

function getConversionTimeoutMs(fileSizeBytes: number): number {
  const mb = fileSizeBytes / (1024 * 1024);
  const extra = Math.ceil(mb) * CONVERSION_TIMEOUT_PER_MB_MS;
  return Math.min(
    CONVERSION_TIMEOUT_MAX_MS,
    Math.max(CONVERSION_TIMEOUT_MIN_MS, extra + 30_000)
  );
}

/** 同一份 PPT 正在生成第一屏 partial 时，复用同一条 Promise，避免排两次队 */
const partialInFlight = new Map<string, Promise<ConvertToPdfResult>>();

export type ConvertToPdfResult = { path: string; phase: 'full' | 'partial' };

const findSofficePath = (): string | null => {
  for (const p of SOFFICE_PATHS) {
    if (path.isAbsolute(p)) {
      if (fs.existsSync(p)) return p;
    } else {
      return p;
    }
  }
  return null;
};

export const isOfficeFile = (fileName: string): boolean => {
  const ext = path.extname(fileName).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
};

const isImpressFile = (fileName: string): boolean => {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.ppt' || ext === '.pptx' || ext === '.odp';
};

const getPreviewCachePath = (fileHash: string): string =>
  path.join(PREVIEWS_DIR, `${fileHash}-preview.pdf`);

const getPreviewPartialPath = (fileHash: string): string =>
  path.join(PREVIEWS_DIR, `${fileHash}-preview-partial.pdf`);

const getPreviewPartialMetaPath = (fileHash: string): string =>
  path.join(PREVIEWS_DIR, `${fileHash}-preview-partial.meta.json`);

type PartialPreviewMeta = {
  availableSlides: number;
  reachedEnd: boolean;
  updatedAt: string;
};

function readPartialMeta(fileHash: string): PartialPreviewMeta | null {
  const metaPath = getPreviewPartialMetaPath(fileHash);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as PartialPreviewMeta;
    if (typeof raw.availableSlides === 'number' && raw.availableSlides > 0) return raw;
  } catch {
    // ignore
  }
  return null;
}

function writePartialMeta(fileHash: string, meta: PartialPreviewMeta): void {
  ensureDirectoryExists(PREVIEWS_DIR);
  fs.writeFileSync(getPreviewPartialMetaPath(fileHash), JSON.stringify(meta), 'utf8');
}

/** 从 PDF 粗略统计页数（用于判断下一批是否还有新页） */
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

/** 当前快览 PDF 已可用的幻灯片页数（供 preview-state 与前端分批刷新） */
export function getAvailablePartialSlides(fileHash: string): number | null {
  const partialPath = getPreviewPartialPath(fileHash);
  if (!fs.existsSync(partialPath)) return null;
  const meta = readPartialMeta(fileHash);
  if (meta) return meta.availableSlides;
  const pages = countPdfPages(partialPath);
  return pages > 0 ? pages : PPT_PREVIEW_FIRST_SLIDES;
}

export const getPreviewCache = (fileHash: string): string | null => {
  const cachePath = getPreviewCachePath(fileHash);
  if (fs.existsSync(cachePath)) return cachePath;
  return null;
};

/**
 * 仅看磁盘上的预览缓存，不触发 LibreOffice（供轮询：partial → full 时刷新 iframe）
 */
export function getPreviewFilePhase(fileHash: string): 'none' | 'partial' | 'full' {
  if (fs.existsSync(getPreviewCachePath(fileHash))) return 'full';
  if (fs.existsSync(getPreviewPartialPath(fileHash))) return 'partial';
  return 'none';
}

/** PPT 快览前多少页，与 PPT_PREVIEW_FIRST_SLIDES 一致 */
export function getPptPreviewFirstSlideCount(): number {
  return PPT_PREVIEW_FIRST_SLIDES;
}

export type PreviewQueueStatus = {
  queueAvailable: boolean;
  nextBatchTarget: number | null;
  jobs: {
    partial: PreviewJobInfo;
    partialMore: PreviewJobInfo;
    full: PreviewJobInfo;
  };
};

function getNextPartialBatchTarget(fileHash: string): number | null {
  const meta = readPartialMeta(fileHash);
  if (meta?.reachedEnd) return null;
  const currentSlides = meta?.availableSlides ?? getAvailablePartialSlides(fileHash) ?? PPT_PREVIEW_FIRST_SLIDES;
  const nextTarget = currentSlides + PPT_PREVIEW_FIRST_SLIDES;
  if (nextTarget > PPT_PREVIEW_MAX_SLIDES) return null;
  return nextTarget;
}

/** 读 BullMQ 中 partial / partialMore / full 任务状态 */
export async function getPreviewQueueStatus(fileHash: string): Promise<PreviewQueueStatus> {
  const missing: PreviewJobInfo = { state: 'missing' };
  if (!isPreviewQueueAvailable()) {
    return {
      queueAvailable: false,
      nextBatchTarget: null,
      jobs: { partial: missing, partialMore: missing, full: missing },
    };
  }
  const nextBatchTarget = getNextPartialBatchTarget(fileHash);
  const [partial, full, partialMore] = await Promise.all([
    getPreviewJobInfo(fileHash, 'impress-partial'),
    getPreviewJobInfo(fileHash, 'full'),
    nextBatchTarget != null
      ? getPreviewJobInfo(fileHash, 'impress-partial-more', nextBatchTarget)
      : Promise.resolve(missing),
  ]);
  return { queueAvailable: true, nextBatchTarget, jobs: { partial, partialMore, full } };
}

const cleanupStaleProcesses = (): Promise<void> => {
  return new Promise((resolve) => {
    exec('taskkill /F /IM soffice.bin /T 2>NUL', { windowsHide: true }, () => resolve());
  });
};

/**
 * 使用 impress_pdf_Export 的 PageRange，只导出前 n 张幻灯片为 PDF
 */
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

/**
 * 一次性全文转 PDF（Writer / 全文 Impress / 或 partial 失败后的回退）
 */
export const doFullConvert = async (sourceFilePath: string, fileHash: string): Promise<string> => {
  const sofficePath = findSofficePath();
  if (!sofficePath) {
    throw new Error('LibreOffice 未安装或未找到。请安装 LibreOffice 并确保路径正确。');
  }
  await cleanupStaleProcesses();
  if (!fs.existsSync(sourceFilePath)) throw new Error('源文件不存在');

  const finalPath = getPreviewCachePath(fileHash);
  if (fs.existsSync(finalPath)) {
    return finalPath;
  }

  ensureDirectoryExists(PREVIEWS_DIR);
  const tempDir = path.join(PREVIEWS_DIR, `temp-${fileHash}-full-${Date.now()}`);
  ensureDirectoryExists(tempDir);
  const st = fs.statSync(sourceFilePath);
  const baseName = path.basename(sourceFilePath);
  const mb = st.size / (1024 * 1024);
  const bySize = Math.ceil(mb) * CONVERSION_TIMEOUT_PER_MB_MS + 30_000;
  const conversionTimeoutMs = isImpressFile(baseName)
    ? Math.min(PPT_FULL_CONVERSION_MAX_MS, Math.max(CONVERSION_TIMEOUT_MIN_MS, bySize))
    : getConversionTimeoutMs(st.size);
  const sourceBase = path.basename(sourceFilePath, path.extname(sourceFilePath));

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
      { timeout: conversionTimeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
    );
    const pdfPath = findPdfInDir(tempDir, sourceBase);
    if (!pdfPath) {
      throw new Error('LibreOffice 未生成 PDF 文件，可能是文件格式不受支持');
    }
    fs.renameSync(pdfPath, finalPath);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
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
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
};

/**
 * 仅前 N 页（Impress）；allowOverwrite 为 true 时用于分批扩展快览
 */
export const doImpressPartial = async (
  sourceFilePath: string,
  fileHash: string,
  slideCount: number = PPT_PREVIEW_FIRST_SLIDES,
  allowOverwrite = false,
): Promise<string> => {
  const sofficePath = findSofficePath();
  if (!sofficePath) {
    throw new Error('LibreOffice 未安装或未找到。请安装 LibreOffice 并确保路径正确。');
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
  if (allowOverwrite && meta && meta.availableSlides >= slideCount && fs.existsSync(outPath)) {
    return outPath;
  }

  ensureDirectoryExists(PREVIEWS_DIR);
  const tempDir = path.join(PREVIEWS_DIR, `temp-${fileHash}-partial-${Date.now()}`);
  ensureDirectoryExists(tempDir);
  const sourceBase = path.basename(sourceFilePath, path.extname(sourceFilePath));
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
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
    );
    const gen = findPdfInDir(tempDir, sourceBase);
    if (!gen) throw new Error('LibreOffice 未生成部分页 PDF（PageRange 可能不受支持）');
    fs.renameSync(gen, outPath);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });

    const availableSlides = countPdfPages(outPath) || Math.min(slideCount, PPT_PREVIEW_FIRST_SLIDES);
    writePartialMeta(fileHash, {
      availableSlides,
      reachedEnd: false,
      updatedAt: new Date().toISOString(),
    });
    return outPath;
  } catch (error) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
};

function assertPreviewQueueReady(): void {
  if (!isPreviewQueueAvailable()) {
    throw new Error('REDIS_URL 未配置，Office 预览队列不可用');
  }
}

/**
 * 快览分批未完成前，移除排队中的全文任务，避免占用 Worker 导致下一批迟迟不转
 */
async function deferWaitingFullJob(fileHash: string): Promise<void> {
  const state = await getPreviewJobState(fileHash, 'full');
  if (state !== 'waiting' && state !== 'delayed' && state !== 'prioritized') return;
  try {
    const job = await getPreviewQueue().getJob(buildPreviewJobId(fileHash, 'full'));
    if (job) await job.remove();
    logger.info({ fileHash }, '[Preview] 快览扩展中，已推迟排队中的全文任务');
  } catch (err) {
    logger.warn({ err, fileHash }, '[Preview] 推迟全文任务失败');
  }
}

/** 快览已触顶或达到上限后，再排入后台全文转 PDF */
async function scheduleFullPptInBackground(fileHash: string, sourceFilePath: string): Promise<void> {
  if (fs.existsSync(getPreviewCachePath(fileHash))) return;

  const state = await getPreviewJobState(fileHash, 'full');
  if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized') {
    return;
  }

  try {
    await enqueuePreviewJob({
      op: 'full',
      fileHash,
      sourceFilePath,
      isBackground: true,
    });
  } catch (err) {
    logger.warn({ err, fileHash }, '[Preview] 后台全文入队失败（可能已有同 jobId 任务）');
  }
}

async function tryScheduleFullAfterPartialExpansion(
  fileHash: string,
  sourceFilePath: string,
): Promise<void> {
  const meta = readPartialMeta(fileHash);
  if (!meta?.reachedEnd && (meta?.availableSlides ?? 0) < PPT_PREVIEW_MAX_SLIDES) {
    return;
  }
  await scheduleFullPptInBackground(fileHash, sourceFilePath);
}

/** 快览分批未完成时，后台全文任务应让路 */
export function shouldDeferFullConversion(fileHash: string): boolean {
  if (fs.existsSync(getPreviewCachePath(fileHash))) return false;
  const partialPath = getPreviewPartialPath(fileHash);
  if (!fs.existsSync(partialPath)) return false;
  const meta = readPartialMeta(fileHash);
  if (meta?.reachedEnd) return false;
  const available = meta?.availableSlides ?? countPdfPages(partialPath);
  return available > 0 && available < PPT_PREVIEW_MAX_SLIDES;
}

/**
 * 在已有 partial 后，按批扩展快览（25 → 50 → 75 …），直到触顶或全文就绪
 */
async function scheduleNextPartialBatch(fileHash: string, sourceFilePath: string): Promise<void> {
  if (fs.existsSync(getPreviewCachePath(fileHash))) return;

  const partialPath = getPreviewPartialPath(fileHash);
  if (!fs.existsSync(partialPath)) return;

  let meta = readPartialMeta(fileHash);
  if (!meta) {
    const pages = countPdfPages(partialPath) || PPT_PREVIEW_FIRST_SLIDES;
    meta = { availableSlides: pages, reachedEnd: false, updatedAt: new Date().toISOString() };
    writePartialMeta(fileHash, meta);
  }
  if (meta.reachedEnd) {
    await tryScheduleFullAfterPartialExpansion(fileHash, sourceFilePath);
    return;
  }

  await deferWaitingFullJob(fileHash);

  const nextTarget = meta.availableSlides + PPT_PREVIEW_FIRST_SLIDES;
  if (nextTarget > PPT_PREVIEW_MAX_SLIDES) {
    writePartialMeta(fileHash, { ...meta, reachedEnd: true, updatedAt: new Date().toISOString() });
    await tryScheduleFullAfterPartialExpansion(fileHash, sourceFilePath);
    return;
  }

  const state = await getPreviewJobState(fileHash, 'impress-partial-more', nextTarget);
  if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized') {
    return;
  }

  try {
    await enqueuePreviewJob({
      op: 'impress-partial-more',
      fileHash,
      sourceFilePath,
      targetSlides: nextTarget,
      isBackground: true,
    });
    logger.info({ fileHash, nextTarget }, '[Preview] 已排入下一批快览');
  } catch (err) {
    logger.warn({ err, fileHash, nextTarget }, '[Preview] 快览分批入队失败');
  }
}

/** 供 preview-state 轮询时补排遗漏的分批任务 */
export async function ensurePartialBatchScheduled(
  fileHash: string,
  sourceFilePath: string,
): Promise<void> {
  if (!isPreviewQueueAvailable()) return;
  if (getPreviewFilePhase(fileHash) !== 'partial') return;
  await scheduleNextPartialBatch(fileHash, sourceFilePath);
}

/**
 * 在已有 partial 或 partial 刚生成后，将「全文转 PDF」排入 BullMQ — 仅快览扩展完成后
 */
async function scheduleFullPptInBackgroundIfReady(
  fileHash: string,
  sourceFilePath: string,
): Promise<void> {
  await tryScheduleFullAfterPartialExpansion(fileHash, sourceFilePath);
}

/**
 * BullMQ Worker 消费入口：执行 impress-partial / impress-partial-more / full 转码
 */
export async function processPreviewConvertJob(
  data: PreviewConvertJobData,
): Promise<PreviewConvertJobResult> {
  if (data.op === 'impress-partial') {
    try {
      const p = await doImpressPartial(data.sourceFilePath, data.fileHash);
      if (!fs.existsSync(getPreviewCachePath(data.fileHash))) {
        await scheduleNextPartialBatch(data.fileHash, data.sourceFilePath);
      }
      return { path: p, phase: 'partial' };
    } catch (partialErr) {
      logger.warn({ err: partialErr, fileHash: data.fileHash }, '[Preview] 部分页 PPT 转换失败，回退为全文');
      const p = await doFullConvert(data.sourceFilePath, data.fileHash);
      return { path: p, phase: 'full' };
    }
  }

  if (data.op === 'impress-partial-more') {
    const targetSlides = data.targetSlides ?? PPT_PREVIEW_FIRST_SLIDES * 2;
    const partialPath = getPreviewPartialPath(data.fileHash);
    const prevMeta = readPartialMeta(data.fileHash);
    const prevCount = prevMeta?.availableSlides ?? countPdfPages(partialPath);

    if (fs.existsSync(getPreviewCachePath(data.fileHash)) || prevMeta?.reachedEnd) {
      return { path: partialPath, phase: 'partial' };
    }

    try {
      await doImpressPartial(data.sourceFilePath, data.fileHash, targetSlides, true);
      const newCount = countPdfPages(partialPath) || prevCount;

      if (newCount <= prevCount) {
        writePartialMeta(data.fileHash, {
          availableSlides: prevCount,
          reachedEnd: true,
          updatedAt: new Date().toISOString(),
        });
        logger.info({ fileHash: data.fileHash, availableSlides: prevCount }, '[Preview] 快览已触顶，等待全文 PDF');
        await tryScheduleFullAfterPartialExpansion(data.fileHash, data.sourceFilePath);
      } else {
        writePartialMeta(data.fileHash, {
          availableSlides: newCount,
          reachedEnd: false,
          updatedAt: new Date().toISOString(),
        });
        logger.info(
          { fileHash: data.fileHash, availableSlides: newCount, targetSlides },
          '[Preview] 快览分批扩展完成',
        );
        await scheduleNextPartialBatch(data.fileHash, data.sourceFilePath);
      }
      return { path: partialPath, phase: 'partial' };
    } catch (err) {
      logger.warn({ err, fileHash: data.fileHash, targetSlides }, '[Preview] 快览分批扩展失败');
      throw err;
    }
  }

  if (data.op === 'full') {
    const p = await doFullConvert(data.sourceFilePath, data.fileHash);
    if (data.isBackground) {
      logger.info({ fileHash: data.fileHash, path: p }, '[Preview] 后台全文 PDF 已就绪');
    }
    return { path: p, phase: 'full' };
  }

  throw new Error(`未知预览操作: ${data.op}`);
}
// 入队完然后直接等待bullmq把当前任务跑完
async function enqueueAndWait(
  data: PreviewConvertJobData,  // 预览任务载荷：op impress-partial / full）、fileHash、sourceFilePath、可选 isBackground
  timeoutMs: number,
): Promise<ConvertToPdfResult> {  // 返回值{ path, phase: 'full' | 'partial' }
  assertPreviewQueueReady();  // 无 REDIS_URL 直接报错
  const job = await enqueuePreviewJob(data); // 把任务写入 BullMQ 队列 preview-convert，job 名 convert
  if (!job.id) {  // BullMQ 正常会返回 job id；若没有，说明入队异常，抛错 预览任务入队失败：未获得 jobId，避免后面用空 id 去等
    throw new Error('预览任务入队失败：未获得 jobId');
  }
  // 入队完然后直接等待bullmq把当前任务跑完。BullMQ 的 Worker 自动消费队列里的任务。不用手动消费
  return waitPreviewJobFinished(job.id, timeoutMs); //订阅 QueueEvents，调用 job.waitUntilFinished(...), 阻塞到 Worker return
}

function getFullConvertWaitTimeoutMs(sourceFilePath: string): number {
  if (!fs.existsSync(sourceFilePath)) {
    return CONVERSION_TIMEOUT_MAX_MS;
  }
  const baseName = path.basename(sourceFilePath);
  if (isImpressFile(baseName)) {
    const st = fs.statSync(sourceFilePath);
    const mb = st.size / (1024 * 1024);
    const bySize = Math.ceil(mb) * CONVERSION_TIMEOUT_PER_MB_MS + 30_000;
    return Math.min(PPT_FULL_CONVERSION_MAX_MS, Math.max(CONVERSION_TIMEOUT_MIN_MS, bySize));
  }
  return getConversionTimeoutMs(fs.statSync(sourceFilePath).size);
}

/**
 * 将 Office 文档转为预览用 PDF
 * PPT/ODP：无缓存时先出前 PPT_PREVIEW_FIRST_SLIDES 张，再后台出全文
 */
export const convertToPdf = async (
  sourceFilePath: string,
  fileHash: string
): Promise<ConvertToPdfResult> => {
  const fullP = getPreviewCachePath(fileHash);
  if (fs.existsSync(fullP)) { // 若全文 PDF 已存在，直接返回，不再调 LibreOffice
    return { path: fullP, phase: 'full' };
  }
  const base = path.basename(sourceFilePath); // ：取文件名（不含目录），例如 report.ppt
  // 分支A
  if (isImpressFile(base)) { //  判断扩展名是否为 .ppt / .pptx / .odp,只有这类文件走「先 partial、后 full」策略；Word 等走后面的全文分支。
    const partP = getPreviewPartialPath(fileHash); //取前25页的转换缓存
    if (fs.existsSync(partP)) {   // 若 partial 已在磁盘上
      await scheduleNextPartialBatch(fileHash, sourceFilePath);
      await scheduleFullPptInBackgroundIfReady(fileHash, sourceFilePath);
      return { path: partP, phase: 'partial' };
    }
    // 分支 B：同一文件正在生成 partial
    const inFlight = partialInFlight.get(fileHash);
    if (inFlight) { // 若已有进行中的 partial Promise（例如两个请求同时预览同一 PPT），复用同一个 Promise，避免重复入队、重复转码。
      return inFlight;
    }
    // PPT 分支 C：首次请求，入队 partial
    const pr = enqueueAndWait(     // 1.检查 Redis/BullMQ 是否可用,2.入队 impress-partial 任务，并同步等待 Worker 完成
      {
        op: 'impress-partial',
        fileHash,
        sourceFilePath,
        isBackground: false, // 这是用户正在等的请求，不是后台静默任务
      },
      PPT_PARTIAL_TIMEOUT_MS, // 最多等 PPT_PARTIAL_TIMEOUT_MS，默认最多 240 秒
    );
    pr.finally(() => partialInFlight.delete(fileHash)); // 无论成功或失败，Promise 结束后从 partialInFlight 删除，避免 Map 泄漏
    partialInFlight.set(fileHash, pr); // 把这条 Promise 放进 Map，供并发请求复用。
    return pr; // 返回该 Promise；Worker 里会调 doImpressPartial，成功后通常还会触发后台 full
  }

  // 分支 D：Word 等其他文件，直接转全文
  return enqueueAndWait(    // 1.检查 Redis/BullMQ 是否可用,2.入队 full 任务，并同步等待 Worker 完成
    {
      op: 'full',
      fileHash,
      sourceFilePath,
      isBackground: false,
    },
    getFullConvertWaitTimeoutMs(sourceFilePath),
  );
};

export const checkLibreOfficeInstallation = (): { installed: boolean; path: string | null } => {
  const p = findSofficePath();
  return { installed: p !== null, path: p };
};
