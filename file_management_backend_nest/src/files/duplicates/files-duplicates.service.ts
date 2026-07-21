import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

export type DuplicateMember = {
  id: number;
  fileName: string;
  fileType: string;
  mimeType: string | null;
  fileSize: number | null;
  parentId: number | null;
  fileHash: string | null;
};

export type DuplicateGroup = {
  groupId: string;
  /** 仅完全重复（同一 content hash） */
  kind: 'exact_hash';
  members: DuplicateMember[];
};

export type DuplicatesScanResult = {
  groups: DuplicateGroup[];
  scannedFileCount: number;
  exactGroupCount: number;
};

function toMember(row: {
  id: number;
  fileName: string;
  fileType: string;
  parentId: number | null;
  storage: {
    fileHash: string;
    mimeType: string | null;
    fileSize: bigint | number | null;
  } | null;
}): DuplicateMember {
  return {
    id: row.id,
    fileName: row.fileName,
    fileType: String(row.fileType),
    mimeType: row.storage?.mimeType ?? null,
    fileSize:
      row.storage?.fileSize != null ? Number(row.storage.fileSize) : null,
    parentId: row.parentId,
    fileHash: row.storage?.fileHash ?? null,
  };
}

@Injectable()
export class FilesDuplicatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 完全重复查重：同一 storage.fileHash 且 ≥2 个未删除网盘文件。
   * （字节级相同；仅改名也会进同一组。不做 AI 近似去重。）
   */
  async scan(userId: number): Promise<DuplicatesScanResult> {
    const files = await this.prisma.userFile.findMany({
      where: {
        userId,
        isDeleted: false,
        fileType: 'file',
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        parentId: true,
        storage: {
          select: {
            fileHash: true,
            mimeType: true,
            fileSize: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const hashBuckets = new Map<string, typeof files>();
    for (const f of files) {
      const hash = f.storage?.fileHash?.trim();
      if (!hash) continue;
      const list = hashBuckets.get(hash) ?? [];
      list.push(f);
      hashBuckets.set(hash, list);
    }

    const groups: DuplicateGroup[] = [];
    let exactIdx = 0;
    for (const [hash, members] of hashBuckets) {
      if (members.length < 2) continue;
      exactIdx += 1;
      groups.push({
        groupId: `exact-${exactIdx}-${hash.slice(0, 8)}`,
        kind: 'exact_hash',
        members: members.map(toMember),
      });
    }

    return {
      groups,
      scannedFileCount: files.length,
      exactGroupCount: groups.length,
    };
  }
}
