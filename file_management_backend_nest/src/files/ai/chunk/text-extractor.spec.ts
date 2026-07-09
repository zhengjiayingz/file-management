import { Readable } from 'node:stream';
import type { StorageProvider } from '@/storage/types';
import {
  UnsupportedDocumentFormatError,
  extractTextFromBuffer,
  extractTextFromStorage,
  extractTextFromStream,
  isIndexableTextDocument,
} from './text-extractor';

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
  });

  describe('extractTextFromBuffer', () => {
    it('应解码 UTF-8 文本', () => {
      const text = extractTextFromBuffer(Buffer.from('你好\nworld', 'utf8'), {
        fileName: 'a.txt',
        mimeType: 'text/plain',
      });
      expect(text).toBe('你好\nworld');
    });

    it('格式不支持时应抛 UnsupportedDocumentFormatError', () => {
      expect(() =>
        extractTextFromBuffer(Buffer.from('x'), {
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
        }),
      ).toThrow(UnsupportedDocumentFormatError);
    });

    it('非法 UTF-8 应抛 UnsupportedDocumentFormatError', () => {
      expect(() =>
        extractTextFromBuffer(Buffer.from([0xff, 0xfe, 0xfd]), {
          fileName: 'a.txt',
          mimeType: 'text/plain',
        }),
      ).toThrow(UnsupportedDocumentFormatError);
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
          storedPath: 'uploads/a.pdf',
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatError);

      expect(existsMock).not.toHaveBeenCalled();
    });
  });
});
