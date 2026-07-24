import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { putMathTempFile } from './math-temp-storage.helper';

describe('putMathTempFile', () => {
  const prevUpload = process.env.UPLOAD_PATH;
  let tmpRoot: string;
  let srcFile: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'math-temp-put-'));
    // 模拟 UPLOAD_PATH 在 cwd 之外（相对路径含 ..），复现 basename 丢失 bug
    const uploadAbs = path.join(tmpRoot, 'outside-uploads');
    fs.mkdirSync(uploadAbs, { recursive: true });
    process.env.UPLOAD_PATH = path.relative(process.cwd(), uploadAbs);
    srcFile = path.join(tmpRoot, 'src.png');
    fs.writeFileSync(srcFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  afterEach(() => {
    if (prevUpload === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = prevUpload;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('local key keeps math-temp/{userId}/ prefix when UPLOAD_PATH is outside cwd', async () => {
    const storage = { driver: 'local' as const };
    const key = await putMathTempFile({
      storage: storage as never,
      userId: 2,
      localFilePath: srcFile,
      ext: '.png',
    });

    expect(key.replace(/\\/g, '/')).toMatch(/math-temp\/2\/.+\.png$/);
    expect(key).not.toMatch(/uploads\/[0-9a-f-]{36}\.png$/i);

    const uploadAbs = path.resolve(process.cwd(), process.env.UPLOAD_PATH!);
    const leaf = path.basename(key);
    const abs = path.join(uploadAbs, 'math-temp', '2', leaf);
    expect(fs.existsSync(abs)).toBe(true);
  });
});
