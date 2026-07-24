import type { Request, Response } from 'express';
import path from 'node:path';

/** 下载/预览响应 Content-Type（保留库内 audio/*，避免 .ogg 音频被标成 video/ogg） */
export function resolveDownloadContentType(
  fileName: string,
  storedMime: string | null | undefined,
): string {
  const ext = path.extname(fileName).toLowerCase();
  const base = (storedMime || 'application/octet-stream').trim();

  if (ext === '.ogg') {
    return base.startsWith('audio/') ? 'audio/ogg' : 'video/ogg';
  }

  const byExt: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska',
    '.rmvb': 'application/vnd.rn-realmedia',
    '.rm': 'application/vnd.rn-realmedia',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.opus': 'audio/opus',
  };

  if (byExt[ext]) return byExt[ext];
  return base;
}

/** 本地文件发送：Express sendFile 自动处理 Content-Length 与 Range（OGG/音视频 seek 依赖此项） */
export function sendLocalFileWithRange(
  req: Request,
  res: Response,
  absolutePath: string,
  opts: { contentType: string; disposition: 'inline' | 'attachment'; fileName: string },
): void {
  res.sendFile(
    absolutePath,
    {
      acceptRanges: true,
      headers: {
        'Content-Disposition': `${opts.disposition}; filename="${encodeURIComponent(opts.fileName)}"`,
        'Content-Type': opts.contentType,
      },
    },
    (err) => {
      if (err) {
        console.error('sendFile error:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: '文件下载失败' });
        }
      }
    },
  );
}
