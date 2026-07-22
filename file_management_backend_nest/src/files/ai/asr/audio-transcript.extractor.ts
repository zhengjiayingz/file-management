import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

import type { StorageProvider } from '@/storage/types';
import {
  isIndexableAudio,
  type TextDocumentRef,
} from '@/files/ai/chunk/text-extractor';
import { UnsupportedDocumentFormatError } from '@/files/ai/chunk/text-extractor';

import { transcribeFile } from './asr.provider';
import type { AsrTranscript } from './asr.types';
import { cleanupPreparedAudio, prepareAudioForAsr } from './media-audio.util';

async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * 从 Storage 拉取音频 → 转 16k mono → ASR，得到带时间轴文稿。
 * @param storage 当前 StorageProvider（与文档索引同一套）
 * @param input storedPath / fileName / mimeType
 * @returns 全文 + segments（startMs/endMs）
 */
export async function extractAudioTranscriptFromStorage(
  storage: StorageProvider,
  input: TextDocumentRef,
): Promise<AsrTranscript> {
  if (!isIndexableAudio(input)) {
    throw new UnsupportedDocumentFormatError(
      '不支持的音频格式，请使用 mp3/wav/m4a 等常见音频',
    );
  }

  const exists = await storage.exists(input.storedPath);
  if (!exists) {
    throw new Error('文件不存在或已被删除');
  }

  const stream = await storage.getReadStream(input.storedPath);
  const buffer = await readStreamToBuffer(stream);

  // 原始字节落临时文件，供 ffmpeg / ASR 读路径
  const downloadDir = await mkdtemp(join(tmpdir(), 'asr-dl-'));
  const sourcePath = join(downloadDir, input.fileName || 'audio.bin');
  let prepared: Awaited<ReturnType<typeof prepareAudioForAsr>> | null = null;

  try {
    await writeFile(sourcePath, buffer);
    prepared = await prepareAudioForAsr(sourcePath);
    return await transcribeFile(prepared.wavPath);
  } finally {
    await cleanupPreparedAudio(prepared);
    await rm(downloadDir, { recursive: true, force: true });
  }
}
