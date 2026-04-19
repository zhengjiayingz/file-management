import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { Request } from 'express';
import type { AuthRequest } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const avatarDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const userId = (req as AuthRequest).user?.id ?? 'unknown';
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `user-${userId}-${Date.now()}${ext}`);
  },
});

const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const okMime = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
  const ext = path.extname(file.originalname).toLowerCase();
  const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  if (okMime && okExt) {
    cb(null, true);
    return;
  }
  cb(new Error('仅支持 jpeg、png、gif、webp 图片'));
};

/** 头像上传：单文件字段名 avatar，最大 2MB */
export const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter,
});
