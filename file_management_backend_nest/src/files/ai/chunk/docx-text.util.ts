import type { Readable } from 'node:stream';
import yauzl from 'yauzl';

const DOCX_DOCUMENT_XML = 'word/document.xml';
const MIN_DOCX_TEXT_CHARS = 30;

/** 从 OOXML document.xml 提取纯文本（按段落换行） */
export function extractTextFromDocumentXml(xml: string): string {
  const paragraphs: string[] = [];
  const parts = xml.split(/<w:p[\s>]/);

  for (const part of parts.slice(1)) {
    const segment = part.split(/<\/w:p>/)[0] ?? '';
    const texts: string[] = [];
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(segment)) !== null) {
      texts.push(match[1]);
    }
    if (texts.length > 0) {
      paragraphs.push(texts.join(''));
    }
  }

  return paragraphs.join('\n');
}

function readZipEntry(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error('无法读取 docx 条目'));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

function openDocxZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, autoClose: true },
      (err, zipfile) => {
        if (err || !zipfile) {
          reject(err ?? new Error('无法解析 docx 压缩包'));
          return;
        }
        resolve(zipfile);
      },
    );
  });
}

function findDocumentXmlEntry(zipfile: yauzl.ZipFile): Promise<yauzl.Entry> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    zipfile.on('entry', (entry: yauzl.Entry) => {
      if (entry.fileName === DOCX_DOCUMENT_XML) {
        finish(() => resolve(entry));
        return;
      }
      zipfile.readEntry();
    });

    zipfile.on('end', () => {
      finish(() => reject(new Error('docx 中未找到 document.xml')));
    });

    zipfile.on('error', (err) =>
      finish(() => reject(err instanceof Error ? err : new Error(String(err)))),
    );
    zipfile.readEntry();
  });
}

export class EmptyDocxError extends Error {
  constructor(message = 'Word 文档未检测到可索引文字') {
    super(message);
    this.name = 'EmptyDocxError';
  }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const zipfile = await openDocxZip(buffer);
  try {
    const entry = await findDocumentXmlEntry(zipfile);
    const xmlBuffer = await readZipEntry(zipfile, entry);
    const text = extractTextFromDocumentXml(xmlBuffer.toString('utf-8'))
      .replace(/\r\n/g, '\n')
      .replace(/\s+\n/g, '\n')
      .trim();

    if (text.length < MIN_DOCX_TEXT_CHARS) {
      throw new EmptyDocxError();
    }

    return text;
  } finally {
    zipfile.close();
  }
}

/** 将 Readable 读入 Buffer（供 docx 解压前使用） */
export async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : Buffer.from(chunk as Uint8Array | string),
    );
  }
  return Buffer.concat(chunks);
}
