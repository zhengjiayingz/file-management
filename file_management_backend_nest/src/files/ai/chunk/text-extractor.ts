import type { Readable } from 'node:stream';
import type { StorageProvider } from '@/storage/types';
import { EmptyDocxError, extractDocxText } from './docx-text.util';
import { extractPdfTextWithPdfJs } from './pdf-text.util';
import { PdfOcrPageLimitError, extractScannedPdfText } from './pdf-ocr.util';
import { extractTextFromImage } from '@/files/ai/vision/vision.provider';

/** 格式不支持（扩展名/MIME 不匹配） */
export class UnsupportedDocumentFormatError extends Error {
  constructor(
    message = '不支持的文档格式，仅支持 UTF-8 的 .txt / .md、.pdf（含扫描件）、.docx 及可 OCR 的图片',
  ) {
    super(message);
    this.name = 'UnsupportedDocumentFormatError';
  }
}

/** 扫描件或无可提取文字 */
export class ScannedPdfError extends Error {
  constructor(
    message = '该 PDF 未检测到可选中文字，可能为扫描件，暂不支持索引',
  ) {
    super(message);
    this.name = 'ScannedPdfError';
  }
}

export type TextDocumentRef = {
  storedPath: string;
  fileName: string;
  mimeType: string;
};

/** 抽字进度事件（当前仅扫描 PDF OCR 页级） */
export type ExtractTextProgress = {
  /** 事件种类 */
  kind: 'pdf_ocr_page';
  /** 当前页（从 1 起） */
  page: number;
  /** 总页数 */
  totalPages: number;
};

/** extractTextFromStorage / extractPdfText 等可选参数 */
export type ExtractTextOptions = {
  /** 进度回调；扫描 OCR 每页开始前触发 */
  onProgress?: (p: ExtractTextProgress) => void | Promise<void>;
};

const MIN_PDF_TEXT_CHARS = 30;

function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? '').trim().toLowerCase();
}

function isTxtExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.txt');
}

function isMdExtension(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

function isPdfExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

function isDocxExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.docx');
}

function isTxtMime(mimeType: string): boolean {
  return (
    mimeType === 'text/plain' ||
    mimeType === 'application/octet-stream' ||
    mimeType.startsWith('text/')
  );
}

function isMdMime(mimeType: string): boolean {
  return (
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown' ||
    mimeType === 'text/plain' ||
    mimeType.startsWith('text/')
  );
}

function isPdfMime(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function isDocxMime(mimeType: string): boolean {
  return (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/octet-stream'
  );
}

// 图片白名单
const INDEXABLE_IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);

const INDEXABLE_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

/** 扩展名 + MIME 双判断：txt / md / 文字层 pdf / docx / 图片 */
export function isIndexableTextDocument(input: {
  fileName: string;
  mimeType?: string | null;
}): boolean {
  const mimeType = normalizeMime(input.mimeType);
  if (!mimeType) return false;

  if (isTxtExtension(input.fileName)) return isTxtMime(mimeType);
  if (isMdExtension(input.fileName)) return isMdMime(mimeType);
  if (isPdfExtension(input.fileName)) return isPdfMime(mimeType);
  if (isDocxExtension(input.fileName)) return isDocxMime(mimeType);
  if (isImageExtension(input.fileName)) return isImageMime(mimeType);
  return false;
}

function isPdfDocument(input: {
  fileName: string;
  mimeType?: string | null;
}): boolean {
  return (
    isPdfExtension(input.fileName) && isPdfMime(normalizeMime(input.mimeType))
  );
}

function isDocxDocument(input: {
  fileName: string;
  mimeType?: string | null;
}): boolean {
  return (
    isDocxExtension(input.fileName) && isDocxMime(normalizeMime(input.mimeType))
  );
}

function isImageDocument(input: {
  fileName: string;
  mimeType?: string | null;
}) {
  return (
    isImageExtension(input.fileName) &&
    isImageMime(normalizeMime(input.mimeType))
  );
}

function isImageExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return INDEXABLE_IMAGE_EXTS.has(lower.slice(dot));
}
function isImageMime(mimeType: string): boolean {
  return INDEXABLE_IMAGE_MIMES.has(mimeType);
}

export { EmptyDocxError, PdfOcrPageLimitError };

async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new UnsupportedDocumentFormatError('文档不是有效的 UTF-8 文本');
  }
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+\n/g, '\n').trim();
}

/**
 * 兜底：坐标抽取已尽量保留空格；仍对驼峰/标点做轻量修补。
 */
export function softInsertEnglishSpaces(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([.!?,:;])([A-Za-z])/g, '$1 $2')
    .replace(/(["'”)\]}])([A-Za-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/([\u4e00-\u9fff])([A-Za-z])/g, '$1 $2');
}

/**
 * 调用扫描 OCR；页数超限原样抛出，其它失败包装为 ScannedPdfError。
 */
async function runScannedPdfOcr(
  buffer: Buffer,
  options?: ExtractTextOptions,
): Promise<string> {
  try {
    return await extractScannedPdfText(buffer, {
      onPageProgress: async (page, totalPages) => {
        await options?.onProgress?.({
          kind: 'pdf_ocr_page',
          page,
          totalPages,
        });
      },
    });
  } catch (err) {
    if (err instanceof PdfOcrPageLimitError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScannedPdfError(
      msg.includes('OCR') || msg.includes('文字')
        ? msg
        : `扫描 PDF OCR 失败：${msg}`,
    );
  }
}

/**
 * 抽取 PDF 全文：优先文字层；过少或抽字失败时 fallback 渲页 OCR（F-30）。
 */
export async function extractPdfText(
  buffer: Buffer,
  options?: ExtractTextOptions,
): Promise<string> {
  let layerText = '';
  let layerFailed = false;
  try {
    // 抽取文字层
    const raw = await extractPdfTextWithPdfJs(buffer);
    layerText = softInsertEnglishSpaces(normalizeExtractedText(raw));
  } catch {
    layerFailed = true;
  }

  // 文字层足够：不走 OCR（省钱、也避免扫描噪点）
  if (!layerFailed && layerText.length >= MIN_PDF_TEXT_CHARS) {
    return layerText;
  }

  // 文字层不足：逐页渲染 → OCR → 拼接全文
  return runScannedPdfOcr(buffer, options);
}

/**
 * 按文件类型从 Buffer 抽出可索引纯文本（索引流水线的统一入口内部实现）。
 * 路由：PDF → extractPdfText（文字层 / 扫描 OCR）；docx → 解压正文；
 * 图片 → Vision OCR；其余按 UTF-8 文本解码。格式不支持则抛 UnsupportedDocumentFormatError。
 */
async function extractTextFromBufferInternal(
  buffer: Buffer,
  input: { fileName: string; mimeType?: string | null },
  options?: ExtractTextOptions,
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }

  if (isPdfDocument(input)) {
    return extractPdfText(buffer, options);
  }

  if (isDocxDocument(input)) {
    return extractDocxText(buffer);
  }
  // 从图片抽取文字
  if (isImageDocument(input)) {
    const mime = normalizeMime(input.mimeType) || 'image/png';
    const text = normalizeExtractedText(
      await extractTextFromImage(buffer, mime),
    );
    if (!text) {
      throw new Error('OCR 未识别到可用文字');
    }
    return text;
  }

  return decodeUtf8(buffer);
}

/** 单测与可选进度回调入口 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  input: { fileName: string; mimeType?: string | null },
  options?: ExtractTextOptions,
): Promise<string> {
  return extractTextFromBufferInternal(buffer, input, options);
}

export async function extractTextFromStream(
  stream: Readable,
  input: { fileName: string; mimeType?: string | null },
  options?: ExtractTextOptions,
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }
  const buffer = await readStreamToBuffer(stream);
  return extractTextFromBufferInternal(buffer, input, options);
}

export async function extractTextFromStorage(
  storage: StorageProvider,
  input: TextDocumentRef,
  options?: ExtractTextOptions,
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }

  const exists = await storage.exists(input.storedPath);
  if (!exists) {
    throw new Error('文件不存在或已被删除');
  }

  const stream = await storage.getReadStream(input.storedPath);
  return extractTextFromStream(stream, input, options);
}
