import { Readable } from 'node:stream';
import archiver from 'archiver';
import type { StorageProvider } from '@/storage/types';

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ text: '' }),
}));

import {
  EmptyDocxError,
  ScannedPdfError,
  UnsupportedDocumentFormatError,
  extractTextFromBuffer,
  extractTextFromStorage,
  extractTextFromStream,
  isIndexableTextDocument,
} from './text-extractor';

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  'utf-8',
);

function buildMinimalDocx(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip');
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`;
    archive.append(xml, { name: 'word/document.xml' });
    void archive.finalize();
  });
}

/** 构造最小 mock，只实现 text-extractor 用到的 3 个方法 */
function createMockStorage(
  overrides: {
    exists?: jest.Mock;
    getReadStream?: jest.Mock;
  } = {},
) {
  const existsMock = overrides.exists ?? jest.fn().mockResolvedValue(true);
  const getReadStreamMock =
    overrides.getReadStream ??
    jest.fn().mockResolvedValue(Readable.from(['hello']));

  const storage: StorageProvider = {
    driver: 'local',
    putFromLocalFile: jest.fn(),
    exists: existsMock,
    getReadStream: getReadStreamMock,
    delete: jest.fn(),
  };

  return { storage, existsMock, getReadStreamMock };
}

describe('text-extractor', () => {
  describe('isIndexableTextDocument', () => {
    it('允许 .txt + text/plain', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'notes.txt',
          mimeType: 'text/plain',
        }),
      ).toBe(true);
    });

    it('允许 .md + text/markdown', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'readme.md',
          mimeType: 'text/markdown',
        }),
      ).toBe(true);
    });

    it('允许 .txt + application/octet-stream（常见上传类型）', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'raw.txt',
          mimeType: 'application/octet-stream',
        }),
      ).toBe(true);
    });

    it('扩展名与 MIME 不匹配时应拒绝', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'notes.txt',
          mimeType: 'image/png',
        }),
      ).toBe(false);

      expect(
        isIndexableTextDocument({
          fileName: 'paper.pdf',
          mimeType: 'text/plain',
        }),
      ).toBe(false);
    });

    it('mime 为空时应拒绝', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'notes.txt',
          mimeType: null,
        }),
      ).toBe(false);
    });

    it('允许 .pdf + application/pdf', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'paper.pdf',
          mimeType: 'application/pdf',
        }),
      ).toBe(true);
    });

    it('允许 .docx + wordprocessingml MIME', () => {
      expect(
        isIndexableTextDocument({
          fileName: 'report.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ).toBe(true);
    });
  });

  describe('extractTextFromBuffer', () => {
    it('应解码 UTF-8 文本', async () => {
      const text = await extractTextFromBuffer(
        Buffer.from('你好\nworld', 'utf8'),
        {
          fileName: 'a.txt',
          mimeType: 'text/plain',
        },
      );
      expect(text).toBe('你好\nworld');
    });

    it('格式不支持时应抛 UnsupportedDocumentFormatError', async () => {
      await expect(
        extractTextFromBuffer(Buffer.from('x'), {
          fileName: 'a.png',
          mimeType: 'image/png',
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatError);
    });

    it('非法 UTF-8 应抛 UnsupportedDocumentFormatError', async () => {
      await expect(
        extractTextFromBuffer(Buffer.from([0xff, 0xfe, 0xfd]), {
          fileName: 'a.txt',
          mimeType: 'text/plain',
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatError);
    });

    it('无文字层 PDF 应抛 ScannedPdfError', async () => {
      await expect(
        extractTextFromBuffer(MINIMAL_PDF, {
          fileName: 'scan.pdf',
          mimeType: 'application/pdf',
        }),
      ).rejects.toThrow(ScannedPdfError);
    });

    it('应解析 docx 正文', async () => {
      const buf = await buildMinimalDocx(
        'This Word document has enough characters for the indexer.',
      );
      const text = await extractTextFromBuffer(buf, {
        fileName: 'notes.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      expect(text).toContain('Word document');
    });

    it('过短 docx 应抛 EmptyDocxError', async () => {
      const buf = await buildMinimalDocx('tiny');
      await expect(
        extractTextFromBuffer(buf, {
          fileName: 'empty.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ).rejects.toThrow(EmptyDocxError);
    });
  });

  describe('extractTextFromStream', () => {
    it('应从 stream 拼接并解码文本', async () => {
      const stream = Readable.from(['# Title\n', 'content']);
      const text = await extractTextFromStream(stream, {
        fileName: 'a.md',
        mimeType: 'text/markdown',
      });
      expect(text).toBe('# Title\ncontent');
    });
  });

  describe('extractTextFromStorage', () => {
    it('应通过 StorageProvider 读取文件', async () => {
      const { storage, existsMock, getReadStreamMock } = createMockStorage({
        getReadStream: jest
          .fn()
          .mockResolvedValue(Readable.from(['line1\n', 'line2'])),
      });

      const text = await extractTextFromStorage(storage, {
        storedPath: 'uploads/readme.md',
        fileName: 'readme.md',
        mimeType: 'text/markdown',
      });

      expect(text).toBe('line1\nline2');
      expect(existsMock).toHaveBeenCalledWith('uploads/readme.md');
      expect(getReadStreamMock).toHaveBeenCalledWith('uploads/readme.md');
    });

    it('文件不存在时应抛错', async () => {
      const { storage, getReadStreamMock } = createMockStorage({
        exists: jest.fn().mockResolvedValue(false),
      });

      await expect(
        extractTextFromStorage(storage, {
          storedPath: 'uploads/missing.txt',
          fileName: 'missing.txt',
          mimeType: 'text/plain',
        }),
      ).rejects.toThrow('文件不存在或已被删除');

      expect(getReadStreamMock).not.toHaveBeenCalled();
    });

    it('格式不支持时不应读 storage', async () => {
      const { storage, existsMock } = createMockStorage();

      await expect(
        extractTextFromStorage(storage, {
          storedPath: 'uploads/a.png',
          fileName: 'a.png',
          mimeType: 'image/png',
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatError);

      expect(existsMock).not.toHaveBeenCalled();
    });

    it('PDF 应通过 StorageProvider 读取并解析', async () => {
      const { storage, existsMock, getReadStreamMock } = createMockStorage({
        getReadStream: jest
          .fn()
          .mockResolvedValue(Readable.from([MINIMAL_PDF])),
      });

      await expect(
        extractTextFromStorage(storage, {
          storedPath: 'uploads/scan.pdf',
          fileName: 'scan.pdf',
          mimeType: 'application/pdf',
        }),
      ).rejects.toThrow(ScannedPdfError);

      expect(existsMock).toHaveBeenCalledWith('uploads/scan.pdf');
      expect(getReadStreamMock).toHaveBeenCalledWith('uploads/scan.pdf');
    });
  });
});
