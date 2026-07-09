import type { Readable } from 'node:stream';
import type { StorageProvider } from '@/storage/types';

export class UnsupportedDocumentFormatError extends Error {
  constructor(
    message = '不支持的文档格式，仅支持 UTF-8 编码的 .txt / .md 文件',
  ) {
    super(message);
    this.name = 'UnsupportedDocumentFormatError';
  }
}

export type TextDocumentRef = {
  storedPath: string;
  fileName: string;
  mimeType: string;
};

function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? '').trim().toLowerCase();
}

function isTxtExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.txt');
}

function isMdExtension(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
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

/** 扩展名 + MIME 双判断，仅允许索引用 TXT/MD  判断能不能索引（.txt + text/plain，.md + text/markdown 等）*/
export function isIndexableTextDocument(input: {
  fileName: string;
  mimeType?: string | null;
}): boolean {
  const mimeType = normalizeMime(input.mimeType);
  if (!mimeType) return false;

  if (isTxtExtension(input.fileName)) {
    return isTxtMime(mimeType);
  }
  if (isMdExtension(input.fileName)) {
    return isMdMime(mimeType);
  }
  return false;
}

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
// 单测用，直接测 buffer
export function extractTextFromBuffer(
  buffer: Buffer,
  input: { fileName: string; mimeType?: string | null },
): string {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }
  return decodeUtf8(buffer);
}
// 从 stream 读取文件并提取 UTF-8 文本
export async function extractTextFromStream(
  stream: Readable,
  input: { fileName: string; mimeType?: string | null },
): Promise<string> {
  if (!isIndexableTextDocument(input)) {
    throw new UnsupportedDocumentFormatError();
  }
  const buffer = await readStreamToBuffer(stream);
  return decodeUtf8(buffer);
}

/** 从 StorageProvider 读取文件并提取 UTF-8 文本 */
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
