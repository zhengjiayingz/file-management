import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export class ObjectNotFoundError extends Error {
  constructor(public readonly missingId: number) {
    super(`Node not found: ${missingId}`);
    this.name = 'ObjectNotFoundError';
  }
}

@Injectable()
export class FileBatchHelper {
  constructor(private readonly prisma: PrismaService) {}

  async loadParentChainMap(
    startIds: number[],
    userId: number,
  ): Promise<Map<number, number | null>> {
    const pmap = new Map<number, number | null>();
    let frontier = new Set<number>(startIds.filter((id) => id > 0));

    while (frontier.size > 0) {
      const ids = [...frontier];
      frontier = new Set();
      const rows = await this.prisma.userFile.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true, parentId: true },
      });
      const found = new Set(rows.map((r) => r.id));
      for (const id of ids) {
        if (!found.has(id)) {
          throw new ObjectNotFoundError(id);
        }
      }
      for (const r of rows) {
        pmap.set(r.id, r.parentId);
        if (r.parentId !== null && !pmap.has(r.parentId)) {
          frontier.add(r.parentId);
        }
      }
    }

    return pmap;
  }

  computeSelectionRoots(
    ids: number[],
    pmap: Map<number, number | null>,
  ): number[] {
    const sel = new Set(ids);
    return ids.filter((id) => {
      let p: number | null | undefined = pmap.get(id);
      while (p !== null && p !== undefined) {
        if (sel.has(p)) return false;
        p = pmap.get(p);
      }
      return true;
    });
  }

  async expandDescendants(
    userId: number,
    initialIds: readonly number[],
    isDeleted: boolean,
  ): Promise<Set<number>> {
    const expanded = new Set<number>(initialIds);
    let changed = true;

    while (changed) {
      changed = false;
      const more = await this.prisma.userFile.findMany({
        where: {
          userId,
          isDeleted,
          parentId: { in: [...expanded] },
        },
        select: { id: true },
      });
      for (const row of more) {
        if (!expanded.has(row.id)) {
          expanded.add(row.id);
          changed = true;
        }
      }
    }

    return expanded;
  }

  sanitizeZipPathSegment(name: string): string {
    // eslint-disable-next-line no-control-regex -- zip 路径需剔除控制字符
    const s = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+$/, '');
    return s || 'unnamed';
  }

  isNodeUnderAncestor(
    targetId: number,
    ancestorId: number,
    pmap: Map<number, number | null>,
  ): boolean {
    let cur: number | null | undefined = targetId;
    const seen = new Set<number>();
    while (cur !== null && cur !== undefined) {
      if (cur === ancestorId) return true;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = pmap.get(cur) ?? null;
    }
    return false;
  }
}
