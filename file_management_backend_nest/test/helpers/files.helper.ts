import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPreviewsRootDir } from '@/files/preview/preview-path.utils';
import { getUploadRootDir } from '@/files/utils/storagePath.utils';
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
