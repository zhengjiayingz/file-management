import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import type { RequestUser } from '@/auth/types/jwt-payload.type';

export function getAvatarUploadDir(): string {
  return join(
    process.cwd(),
    '..',
    'file_management_backend',
    'uploads',
    'avatars',
  );
}

export const avatarUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = getAvatarUploadDir();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const user = (req as Request & { user?: RequestUser }).user;
      const userId = user?.id ?? 'unknown';
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `user-${userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    const ext = extname(file.originalname).toLowerCase();
    const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    if (okMime && okExt) {
      cb(null, true);
      return;
    }
    cb(new Error('仅支持 jpeg、png、gif、webp 图片'), false);
  },
};
