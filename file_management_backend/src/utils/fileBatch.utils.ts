import prisma from '../lib/prisma.js';

/**
 * 从给定 id 向上加载整条父链，直到根；用于判断选中项之间的祖先关系。
 */
export async function loadParentChainMap(
  startIds: number[],
  userId: number
): Promise<Map<number, number | null>> {
  const pmap = new Map<number, number | null>();
  let frontier = new Set<number>(startIds.filter((id) => id > 0));
  while (frontier.size > 0) {
    const ids = [...frontier];
    frontier = new Set();
    const rows = await prisma.userFile.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, parentId: true }
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

/** loadParentChainMap 时某 id 不存在 */
export class ObjectNotFoundError extends Error {
  constructor(public readonly missingId: number) {
    super(`Node not found: ${missingId}`);
    this.name = 'ObjectNotFoundError';
  }
}

/** 在选中集合内去掉「子项」：若父也在选中，则只保留顶层根 */
export function computeSelectionRoots(ids: number[], pmap: Map<number, number | null>): number[] {
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

/** 展开所有子孙（用于软删等） */
export async function expandDescendants(
  userId: number,
  initialIds: readonly number[],
  isDeleted: boolean
): Promise<Set<number>> {
  const expanded = new Set<number>(initialIds);
  let changed = true;
  while (changed) {
    changed = false;
    const more = await prisma.userFile.findMany({
      where: {
        userId,
        isDeleted,
        parentId: { in: [...expanded] }
      },
      select: { id: true }
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

/** ZIP 内路径段：去掉非法字符 */
export function sanitizeZipPathSegment(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+$/, '');
  return s || 'unnamed';
}

/**
 * targetId 是否在 ancestorId 的子树中（含自身相等）
 * 需 pmap 已包含从 targetId 到根的链
 */
export function isNodeUnderAncestor(
  targetId: number,
  ancestorId: number,
  pmap: Map<number, number | null>
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
