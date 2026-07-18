import type { Readable } from 'node:stream';
import type { StorageProvider } from '@/storage/types';
import { EmptyDocxError, extractDocxText } from './docx-text.util';
import { extractPdfTextWithPdfJs } from './pdf-text.util';
import { extractTextFromImage } from '@/files/ai/vision/vision.provider';

/** 格式不支持（扩展名/MIME 不匹配） */
export class UnsupportedDocumentFormatError extends Error {
  constructor(
    message = '不支持的文档格式，仅支持 UTF-8 的 .txt / .md、含文字层的 .pdf 及 .docx',
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

export { EmptyDocxError };

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

export async function extractPdfText(buffer: Buffer): Promise<string> {
  let raw: string;
  try {
    raw = await extractPdfTextWithPdfJs(buffer);
  } catch {
    throw new ScannedPdfError();
  }

  const text = softInsertEnglishSpaces(normalizeExtractedText(raw));

  if (text.length < MIN_PDF_TEXT_CHARS) {
    throw new ScannedPdfError();
  }

  return text;
}

async function extractTextFromBufferInternal(
  buffer: Buffer,
  input: { fileName: string; mimeType?: string | null },
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }

  if (isPdfDocument(input)) {
    return extractPdfText(buffer);
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

/** 单测用 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  input: { fileName: string; mimeType?: string | null },
): Promise<string> {
  return extractTextFromBufferInternal(buffer, input);
}

export async function extractTextFromStream(
  stream: Readable,
  input: { fileName: string; mimeType?: string | null },
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }
  const buffer = await readStreamToBuffer(stream);
  return extractTextFromBufferInternal(buffer, input);
}

export async function extractTextFromStorage(
  storage: StorageProvider,
  input: TextDocumentRef,
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }

  const exists = await storage.exists(input.storedPath);
  if (!exists) {
    throw new Error('文件不存在或已被删除');
  }

  const stream = await storage.getReadStream(input.storedPath);
  return extractTextFromStream(stream, input);
}
