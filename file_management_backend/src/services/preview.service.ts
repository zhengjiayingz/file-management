import { exec, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { ensureDirectoryExists } from '../utils/file.utils.js';

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

type QueueTask = {
  op: 'impress-partial' | 'full';
  fileHash: string;
  sourceFilePath: string;
  /** 后台只转缓存、无 HTTP 等待 */
  isBackground?: boolean;
  resolve: (r: { path: string; phase: 'full' | 'partial' }) => void;
  reject: (e: Error) => void;
};

let isConverting = false;
const conversionQueue: QueueTask[] = [];

/** 同一份 PPT 正在生成第一屏 partial 时，复用同一条 Promise，避免排两次队 */
const partialInFlight = new Map<string, Promise<{ path: string; phase: 'full' | 'partial' }>>();

/** 全篇转 PDF 已入队，避免重复排队 */
const fullPptScheduled = new Set<string>();

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

const cleanupStaleProcesses = (): Promise<void> => {
  return new Promise((resolve) => {
    exec('taskkill /F /IM soffice.bin /T 2>NUL', { windowsHide: true }, () => resolve());
  });
};

/**
 * 使用 impress_pdf_Export 的 PageRange，只导出前 n 张幻灯片为 PDF
 */
const buildImpressPartialConvertToArg = (firstSlides: number): string => {
  const filterObj = {
    PageRange: { type: 'string', value: `1-${firstSlides}` },
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
const doFullConvert = async (sourceFilePath: string, fileHash: string): Promise<string> => {
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
    fullPptScheduled.delete(fileHash);
    return finalPath;
  } catch (error) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
};

/**
 * 仅前 N 页（Impress）
 */
const doImpressPartial = async (sourceFilePath: string, fileHash: string): Promise<string> => {
  const sofficePath = findSofficePath();
  if (!sofficePath) {
    throw new Error('LibreOffice 未安装或未找到。请安装 LibreOffice 并确保路径正确。');
  }
  await cleanupStaleProcesses();
  if (!fs.existsSync(sourceFilePath)) throw new Error('源文件不存在');

  const outPath = getPreviewPartialPath(fileHash);
  if (fs.existsSync(outPath)) return outPath;

  ensureDirectoryExists(PREVIEWS_DIR);
  const tempDir = path.join(PREVIEWS_DIR, `temp-${fileHash}-partial-${Date.now()}`);
  ensureDirectoryExists(tempDir);
  const sourceBase = path.basename(sourceFilePath, path.extname(sourceFilePath));
  const convertTo = buildImpressPartialConvertToArg(PPT_PREVIEW_FIRST_SLIDES);

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
      { timeout: PPT_PARTIAL_TIMEOUT_MS, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
    );
    const gen = findPdfInDir(tempDir, sourceBase);
    if (!gen) throw new Error('LibreOffice 未生成部分页 PDF（PageRange 可能不受支持）');
    fs.renameSync(gen, outPath);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    return outPath;
  } catch (error) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
};

/**
 * 在已有 partial 或 partial 刚生成后，将「全文转 PDF」排入同一条队列，立即入队；由 processQueue 串行执行
 */
function scheduleFullPptInBackground(fileHash: string, sourceFilePath: string) {
  if (fs.existsSync(getPreviewCachePath(fileHash))) return;
  if (fullPptScheduled.has(fileHash)) return;
  fullPptScheduled.add(fileHash);
  conversionQueue.push({
    op: 'full',
    fileHash,
    sourceFilePath,
    isBackground: true,
    resolve: () => {},
    reject: () => {},
  });
  processQueue();
}

const processQueue = async () => {
  if (isConverting || conversionQueue.length === 0) return;
  isConverting = true;
  const task = conversionQueue.shift()!;

  try {
    if (task.op === 'impress-partial') {
      let usedPartial = true;
      try {
        const p = await doImpressPartial(task.sourceFilePath, task.fileHash);
        task.resolve({ path: p, phase: 'partial' });
      } catch (partialErr) {
        usedPartial = false;
        console.warn('[Preview] 部分页 PPT 转换失败，回退为仅全文转 PDF', partialErr);
        try {
          const p = await doFullConvert(task.sourceFilePath, task.fileHash);
          task.resolve({ path: p, phase: 'full' });
        } catch (e) {
          task.reject(e as Error);
        }
      }
      if (usedPartial && !fs.existsSync(getPreviewCachePath(task.fileHash))) {
        scheduleFullPptInBackground(task.fileHash, task.sourceFilePath);
      }
    } else {
      const p = await doFullConvert(task.sourceFilePath, task.fileHash);
      if (task.isBackground) {
        fullPptScheduled.delete(task.fileHash);
        console.log(`[Preview] 后台全文 PDF 已就绪: ${p}`);
      } else {
        task.resolve({ path: p, phase: 'full' });
      }
    }
  } catch (e: any) {
    if (task.isBackground) {
      fullPptScheduled.delete(task.fileHash);
      console.error('[Preview] 后台/全文 转换失败:', e);
    } else {
      task.reject(e);
    }
  } finally {
    isConverting = false;
    processQueue();
  }
};

/**
 * 将 Office 文档转为预览用 PDF
 * PPT/ODP：无缓存时先出前 PPT_PREVIEW_FIRST_SLIDES 张，再后台出全文
 */
export const convertToPdf = async (
  sourceFilePath: string,
  fileHash: string
): Promise<ConvertToPdfResult> => {
  const fullP = getPreviewCachePath(fileHash);
  if (fs.existsSync(fullP)) {
    return { path: fullP, phase: 'full' };
  }

  const base = path.basename(sourceFilePath);

  if (isImpressFile(base)) {
    const partP = getPreviewPartialPath(fileHash);
    if (fs.existsSync(partP)) {
      scheduleFullPptInBackground(fileHash, sourceFilePath);
      return { path: partP, phase: 'partial' };
    }

    const inFlight = partialInFlight.get(fileHash);
    if (inFlight) {
      return inFlight;
    }

    const pr = new Promise<ConvertToPdfResult>((resolve, reject) => {
      conversionQueue.push({
        op: 'impress-partial',
        fileHash,
        sourceFilePath,
        isBackground: false,
        resolve,
        reject,
      });
      processQueue();
    });
    pr.finally(() => partialInFlight.delete(fileHash));
    partialInFlight.set(fileHash, pr);
    return pr;
  }

  return new Promise<ConvertToPdfResult>((resolve, reject) => {
    conversionQueue.push({
      op: 'full',
      fileHash,
      sourceFilePath,
      isBackground: false,
      resolve,
      reject,
    });
    processQueue();
  });
};

export const checkLibreOfficeInstallation = (): { installed: boolean; path: string | null } => {
  const p = findSofficePath();
  return { installed: p !== null, path: p };
};
