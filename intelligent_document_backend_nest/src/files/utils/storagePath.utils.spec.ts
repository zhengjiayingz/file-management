import path from 'node:path';
import {
  getUploadRootDir,
  resolveStorageFilePath,
  toStoredRelativePath,
} from './storagePath.utils';

describe('storagePath.utils', () => {
  const prevUpload = process.env.UPLOAD_PATH;

  beforeEach(() => {
    process.env.UPLOAD_PATH = '../intelligent_document_backend/uploads';
  });

  afterEach(() => {
    if (prevUpload === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = prevUpload;
  });

  it('resolveStorageFilePath maps legacy ../file_management_backend/uploads/* to UPLOAD_PATH', () => {
    const stored =
      '../file_management_backend/uploads/d8c70bcd4ba1152d2e914be1d2915bde-哈利波特第5章学习讲义.pdf';
    const phys = resolveStorageFilePath(stored);
    expect(phys).toBe(
      path.join(
        getUploadRootDir(),
        'd8c70bcd4ba1152d2e914be1d2915bde-哈利波特第5章学习讲义.pdf',
      ),
    );
  });

  it('resolveStorageFilePath maps uploads/* to UPLOAD_PATH', () => {
    const phys = resolveStorageFilePath('uploads/abc.pdf');
    expect(phys).toBe(path.join(getUploadRootDir(), 'abc.pdf'));
  });

  it('toStoredRelativePath does not embed backend folder name', () => {
    const abs = path.join(getUploadRootDir(), 'abc.pdf');
    expect(toStoredRelativePath(abs)).toBe('uploads/abc.pdf');
  });
});
