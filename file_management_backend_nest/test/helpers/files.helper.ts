import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createWriteStream } from 'node:fs';
import archiver from 'archiver';
import { getPreviewsRootDir } from '@/files/preview/preview-path.utils';
import { getUploadRootDir } from '@/files/utils/storagePath.utils';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { E2eApp } from './app-bootstrap';

export async function getUserId(
  app: E2eApp,
  username: string,
): Promise<number> {
  const prisma = app.get(PrismaService);
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`User not found: ${username}`);
  return user.id;
}

export async function seedTextFile(
  app: E2eApp,
  userId: number,
  content: string,
  fileName = 'e2e-test.txt',
  parentId: number | null = null,
) {
  const prisma = app.get(PrismaService);
  const uploadRoot = getUploadRootDir();
  fs.mkdirSync(uploadRoot, { recursive: true });

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const storedName = `e2e_${hash.slice(0, 12)}_${fileName}`;
  const absPath = path.join(uploadRoot, storedName);
  fs.writeFileSync(absPath, content, 'utf-8');

  const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
  const filePath = `${uploadRel}/${storedName}`;

  let storage = await prisma.fileStorage.findUnique({
    where: { fileHash: hash },
  });
  if (!storage) {
    storage = await prisma.fileStorage.create({
      data: {
        fileHash: hash,
        filePath,
        fileSize: BigInt(Buffer.byteLength(content, 'utf-8')),
        mimeType: 'text/plain',
        referenceCount: 1,
      },
    });
  } else {
    await prisma.fileStorage.update({
      where: { id: storage.id },
      data: { referenceCount: { increment: 1 } },
    });
  }

  const userFile = await prisma.userFile.create({
    data: {
      userId,
      storageId: storage.id,
      parentId,
      fileName,
      fileType: 'file',
      isDeleted: false,
    },
  });

  return { storage, userFile, content };
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export async function seedImageFile(
  app: E2eApp,
  userId: number,
  fileName = 'e2e-test.png',
  parentId: number | null = null,
) {
  const prisma = app.get(PrismaService);
  const uploadRoot = getUploadRootDir();
  fs.mkdirSync(uploadRoot, { recursive: true });

  const hash = crypto.createHash('sha256').update(PNG_1X1).digest('hex');
  const storedName = `e2e_${hash.slice(0, 12)}_${fileName}`;
  const absPath = path.join(uploadRoot, storedName);
  fs.writeFileSync(absPath, PNG_1X1);

  const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
  const filePath = `${uploadRel}/${storedName}`;

  let storage = await prisma.fileStorage.findUnique({
    where: { fileHash: hash },
  });
  if (!storage) {
    storage = await prisma.fileStorage.create({
      data: {
        fileHash: hash,
        filePath,
        fileSize: BigInt(PNG_1X1.length),
        mimeType: 'image/png',
        referenceCount: 1,
      },
    });
  } else {
    await prisma.fileStorage.update({
      where: { id: storage.id },
      data: { referenceCount: { increment: 1 } },
    });
  }

  const userFile = await prisma.userFile.create({
    data: {
      userId,
      storageId: storage.id,
      parentId,
      fileName,
      fileType: 'file',
      isDeleted: false,
    },
  });

  return { storage, userFile };
}

/** 任意 MIME 的二进制文件（OGG/媒体下载 Range 等回归测试） */
export async function seedBinaryFile(
  app: E2eApp,
  userId: number,
  content: Buffer | string,
  fileName: string,
  mimeType: string,
  parentId: number | null = null,
) {
  const prisma = app.get(PrismaService);
  const uploadRoot = getUploadRootDir();
  fs.mkdirSync(uploadRoot, { recursive: true });

  const buf = typeof content === 'string' ? Buffer.from(content) : content;
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const storedName = `e2e_${hash.slice(0, 12)}_${fileName}`;
  const absPath = path.join(uploadRoot, storedName);
  fs.writeFileSync(absPath, buf);

  const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
  const filePath = `${uploadRel}/${storedName}`;

  let storage = await prisma.fileStorage.findUnique({
    where: { fileHash: hash },
  });
  if (!storage) {
    storage = await prisma.fileStorage.create({
      data: {
        fileHash: hash,
        filePath,
        fileSize: BigInt(buf.length),
        mimeType,
        referenceCount: 1,
      },
    });
  } else {
    await prisma.fileStorage.update({
      where: { id: storage.id },
      data: { referenceCount: { increment: 1 } },
    });
  }

  const userFile = await prisma.userFile.create({
    data: {
      userId,
      storageId: storage.id,
      parentId,
      fileName,
      fileType: 'file',
      isDeleted: false,
    },
  });

  return { storage, userFile, content: buf };
}

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  'utf-8',
);

export async function seedOfficeFile(
  app: E2eApp,
  userId: number,
  content: string | Buffer = 'e2e office doc',
  fileName = 'e2e-test.docx',
  parentId: number | null = null,
) {
  const prisma = app.get(PrismaService);
  const uploadRoot = getUploadRootDir();
  fs.mkdirSync(uploadRoot, { recursive: true });

  const buf =
    typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const storedName = `e2e_${hash.slice(0, 12)}_${fileName}`;
  const absPath = path.join(uploadRoot, storedName);
  fs.writeFileSync(absPath, buf);

  const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
  const filePath = `${uploadRel}/${storedName}`;

  let storage = await prisma.fileStorage.findUnique({
    where: { fileHash: hash },
  });
  if (!storage) {
    storage = await prisma.fileStorage.create({
      data: {
        fileHash: hash,
        filePath,
        fileSize: BigInt(buf.length),
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        referenceCount: 1,
      },
    });
  } else {
    await prisma.fileStorage.update({
      where: { id: storage.id },
      data: { referenceCount: { increment: 1 } },
    });
  }

  const userFile = await prisma.userFile.create({
    data: {
      userId,
      storageId: storage.id,
      parentId,
      fileName,
      fileType: 'file',
      isDeleted: false,
    },
  });

  return { storage, userFile, content: buf };
}

export function writePreviewPdfCache(
  fileHash: string,
  phase: 'full' | 'partial' = 'full',
) {
  const previewsDir = getPreviewsRootDir();
  fs.mkdirSync(previewsDir, { recursive: true });
  const fileName =
    phase === 'full'
      ? `${fileHash}-preview.pdf`
      : `${fileHash}-preview-partial.pdf`;
  const target = path.join(previewsDir, fileName);
  fs.writeFileSync(target, MINIMAL_PDF);
  return target;
}

export async function seedFolder(
  app: E2eApp,
  userId: number,
  folderName: string,
  parentId: number | null = null,
) {
  const prisma = app.get(PrismaService);
  return prisma.userFile.create({
    data: {
      userId,
      parentId,
      fileName: folderName,
      fileType: 'folder',
      isDeleted: false,
    },
  });
}

function md5File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex');
}

export async function seedZipFile(
  app: E2eApp,
  userId: number,
  innerFileName = 'inner.txt',
  innerContent = 'zip-inner-content',
  zipFileName?: string,
) {
  const prisma = app.get(PrismaService);
  const uploadRoot = getUploadRootDir();
  fs.mkdirSync(uploadRoot, { recursive: true });

  const fileName = zipFileName ?? `e2e-${Date.now()}.zip`;
  const absPath = path.join(uploadRoot, fileName);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(absPath);
    const archive = archiver('zip');
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(innerContent, { name: innerFileName });
    void archive.finalize();
  });

  const fileHash = md5File(absPath);
  const storedName = `${fileHash}-${fileName}`;
  const finalPath = path.join(uploadRoot, storedName);
  fs.renameSync(absPath, finalPath);

  const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
  const filePath = `${uploadRel}/${storedName}`;

  const storage = await prisma.fileStorage.create({
    data: {
      fileHash,
      filePath,
      fileSize: BigInt(fs.statSync(finalPath).size),
      mimeType: 'application/zip',
      referenceCount: 1,
      status: 'active',
    },
  });

  const userFile = await prisma.userFile.create({
    data: {
      userId,
      storageId: storage.id,
      fileName,
      fileType: 'file',
      isDeleted: false,
    },
  });

  return { storage, userFile, innerPath: innerFileName };
}

export async function seedFileHistory(
  app: E2eApp,
  userFileId: number,
  storageId: number,
  version: number,
  fileName: string,
  fileSize: number,
) {
  const prisma = app.get(PrismaService);
  return prisma.fileHistory.create({
    data: {
      userFileId,
      storageId,
      fileName,
      version,
      fileSize: BigInt(fileSize),
    },
  });
}

export async function setUserRole(
  app: E2eApp,
  userId: number,
  role: 'user' | 'admin' | 'vip',
) {
  const prisma = app.get(PrismaService);
  return prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

/** 为 RAG / Summary e2e 直接写入 ready 索引与带向量的 chunks（绕过 Worker） */
export async function seedReadyDocumentIndex(
  app: E2eApp,
  userFileId: number,
  chunks: Array<{ content: string; embedding: number[] }>,
  options?: {
    indexedFileHash?: string | null;
    summaryGenre?: 'novel' | 'technical' | 'paper' | 'lab_report';
    mode?: 'general' | 'academic';
  },
) {
  const prisma = app.get(PrismaService);

  let indexedFileHash = options?.indexedFileHash;
  if (indexedFileHash === undefined) {
    const userFile = await prisma.userFile.findUnique({
      where: { id: userFileId },
      select: { storage: { select: { fileHash: true } } },
    });
    indexedFileHash = userFile?.storage?.fileHash ?? null;
  }

  const summaryGenre = options?.summaryGenre ?? 'novel';
  const mode =
    options?.mode ??
    (summaryGenre === 'paper' || summaryGenre === 'lab_report'
      ? 'academic'
      : 'general');

  await prisma.documentChunk.deleteMany({ where: { userFileId } });
  await prisma.documentIndexJob.upsert({
    where: { userFileId },
    create: {
      userFileId,
      mode,
      summaryGenre,
      status: 'ready',
      progress: 100,
      progressMsg: '索引完成',
      chunkCount: chunks.length,
      errorMessage: null,
      indexedFileHash,
    },
    update: {
      mode,
      summaryGenre,
      status: 'ready',
      progress: 100,
      progressMsg: '索引完成',
      chunkCount: chunks.length,
      errorMessage: null,
      indexedFileHash,
    },
  });

  for (let i = 0; i < chunks.length; i++) {
    await prisma.documentChunk.create({
      data: {
        userFileId,
        chunkIndex: i,
        content: chunks[i].content,
        embedding: chunks[i].embedding,
      },
    });
  }
}

/** 为 Summary e2e 写入结构化摘要（需配合 seedReadyDocumentIndex） */
export async function seedDocumentSummary(
  app: E2eApp,
  userFileId: number,
  payload: Record<string, unknown>,
  options?: {
    type?: 'book' | 'chapter' | 'chunk';
    refKey?: string;
  },
) {
  const prisma = app.get(PrismaService);
  const type = options?.type ?? 'book';
  const refKey = options?.refKey ?? 'book';
  const jsonPayload = payload as Prisma.InputJsonValue;

  await prisma.documentSummary.upsert({
    where: {
      userFileId_type_refKey: { userFileId, type, refKey },
    },
    create: { userFileId, type, refKey, payload: jsonPayload },
    update: { payload: jsonPayload },
  });
}

/** 为 Knowledge e2e 写入学术知识卡片（需配合 academic + ready 的 seedReadyDocumentIndex） */
export async function seedDocumentKnowledge(
  app: E2eApp,
  userFileId: number,
  payload: Record<string, unknown>,
) {
  const prisma = app.get(PrismaService);
  const jsonPayload = payload as Prisma.InputJsonValue;

  await prisma.documentKnowledge.upsert({
    where: { userFileId },
    create: { userFileId, payload: jsonPayload },
    update: { payload: jsonPayload },
  });
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 构造最小合法 docx（仅 word/document.xml），供 AI 索引 e2e 使用 */
export function buildMinimalDocxBuffer(text: string): Promise<Buffer> {
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

export async function seedWordFile(
  app: E2eApp,
  userId: number,
  text = 'This is an e2e Word document body with enough text for AI indexing.',
  fileName = 'e2e-test.docx',
  parentId: number | null = null,
) {
  const buf = await buildMinimalDocxBuffer(text);
  return seedBinaryFile(app, userId, buf, fileName, DOCX_MIME, parentId);
}

export async function seedPdfFile(
  app: E2eApp,
  userId: number,
  content: Buffer | string = MINIMAL_PDF,
  fileName = 'e2e-test.pdf',
  parentId: number | null = null,
) {
  const buf =
    typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  return seedBinaryFile(
    app,
    userId,
    buf,
    fileName,
    'application/pdf',
    parentId,
  );
}
