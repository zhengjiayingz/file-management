import { Response } from 'express';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function normalizeColor(c: unknown): string | null {
  if (c == null || typeof c !== 'string') return null;
  const s = c.trim();
  if (!s) return null;
  if (HEX_COLOR.test(s)) return s;
  return null;
}

/** GET /api/files/tags */
export const listTags = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const tags = await prisma.fileTag.findMany({
      where: { userId: req.user.id },
      orderBy: { tagName: 'asc' }
    });
    res.json({
      success: true,
      data: tags.map((t) => ({
        id: t.id,
        tagName: t.tagName,
        color: t.color
      }))
    });
  } catch (e) {
    console.error('listTags:', e);
    res.status(500).json({ success: false, message: '获取标签列表失败' });
  }
};

/** POST /api/files/tags body: { tagName, color? } */
export const createTag = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const { tagName } = req.body;
    if (!tagName || typeof tagName !== 'string' || !tagName.trim()) {
      res.status(400).json({ success: false, message: '标签名称不能为空' });
      return;
    }
    const name = tagName.trim().slice(0, 50);
    const color = normalizeColor(req.body?.color);

    const existing = await prisma.fileTag.findFirst({
      where: { userId: req.user.id, tagName: name }
    });
    if (existing) {
      res.status(409).json({ success: false, message: '已存在同名标签' });
      return;
    }

    const tag = await prisma.fileTag.create({
      data: {
        userId: req.user.id,
        tagName: name,
        color
      }
    });
    res.json({
      success: true,
      data: { id: tag.id, tagName: tag.tagName, color: tag.color }
    });
  } catch (e) {
    console.error('createTag:', e);
    res.status(500).json({ success: false, message: '创建标签失败' });
  }
};

/** PUT /api/files/tags/:tagId body: { tagName?, color? } */
export const updateTag = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const tagId = parseInt(req.params.tagId);
    if (isNaN(tagId)) {
      res.status(400).json({ success: false, message: '无效的标签ID' });
      return;
    }

    const tag = await prisma.fileTag.findFirst({
      where: { id: tagId, userId: req.user.id }
    });
    if (!tag) {
      res.status(404).json({ success: false, message: '标签不存在' });
      return;
    }

    const { tagName } = req.body;
    const data: { tagName?: string; color?: string | null } = {};

    if (tagName !== undefined) {
      if (typeof tagName !== 'string' || !tagName.trim()) {
        res.status(400).json({ success: false, message: '标签名称不能为空' });
        return;
      }
      const name = tagName.trim().slice(0, 50);
      const dup = await prisma.fileTag.findFirst({
        where: { userId: req.user.id, tagName: name, NOT: { id: tagId } }
      });
      if (dup) {
        res.status(409).json({ success: false, message: '已存在同名标签' });
        return;
      }
      data.tagName = name;
    }

    if (req.body.color !== undefined) {
      data.color = normalizeColor(req.body.color);
    }

    if (Object.keys(data).length === 0) {
      res.json({
        success: true,
        data: { id: tag.id, tagName: tag.tagName, color: tag.color }
      });
      return;
    }

    const updated = await prisma.fileTag.update({
      where: { id: tagId },
      data
    });
    res.json({
      success: true,
      data: { id: updated.id, tagName: updated.tagName, color: updated.color }
    });
  } catch (e) {
    console.error('updateTag:', e);
    res.status(500).json({ success: false, message: '更新标签失败' });
  }
};

/** DELETE /api/files/tags/:tagId */
export const deleteTag = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const tagId = parseInt(req.params.tagId);
    if (isNaN(tagId)) {
      res.status(400).json({ success: false, message: '无效的标签ID' });
      return;
    }

    const tag = await prisma.fileTag.findFirst({
      where: { id: tagId, userId: req.user.id }
    });
    if (!tag) {
      res.status(404).json({ success: false, message: '标签不存在' });
      return;
    }

    await prisma.fileTag.delete({ where: { id: tagId } });
    res.json({ success: true, message: '已删除标签' });
  } catch (e) {
    console.error('deleteTag:', e);
    res.status(500).json({ success: false, message: '删除标签失败' });
  }
};

/** 将请求体中的 tagIds 规范为整数数组（兼容 JSON 数字与字符串，如 el-select 可能传出字符串） */
function parseTagIdsBody(raw: unknown): { ok: true; ids: number[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: 'tagIds 须为数组' };
  }
  const ids: number[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      const n = Math.trunc(item);
      if (n !== item) {
        return { ok: false, message: 'tagIds 须为整数' };
      }
      ids.push(n);
      continue;
    }
    if (typeof item === 'string' && item.trim() !== '') {
      const n = parseInt(item.trim(), 10);
      if (Number.isNaN(n)) {
        return { ok: false, message: 'tagIds 内含无法解析的 id' };
      }
      ids.push(n);
      continue;
    }
    return { ok: false, message: 'tagIds 元素须为整数或可解析为整数的字符串' };
  }
  return { ok: true, ids };
}

/** PUT /api/files/:id/tags body: { tagIds: number[] } 全量替换该文件的标签 */
export const setFileTags = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const parsed = parseTagIdsBody(req.body?.tagIds);
    if (!parsed.ok) {
      res.status(400).json({ success: false, message: parsed.message });
      return;
    }
    const tagIds = parsed.ids;

    const userFile = await prisma.userFile.findFirst({
      where: { id: fileId, userId: req.user.id }
    });
    if (!userFile) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    const uniqueIds = [...new Set(tagIds)];
    if (uniqueIds.length > 0) {
      const count = await prisma.fileTag.count({
        where: { userId: req.user.id, id: { in: uniqueIds } }
      });
      if (count !== uniqueIds.length) {
        res.status(400).json({ success: false, message: '包含无效或不属于您的标签' });
        return;
      }
    }

    await prisma.$transaction([
      prisma.userFileTag.deleteMany({ where: { userFileId: fileId } }),
      ...(uniqueIds.length
        ? [
            prisma.userFileTag.createMany({
              data: uniqueIds.map((tagId) => ({ userFileId: fileId, tagId }))
            })
          ]
        : [])
    ]);

    const withTags = await prisma.userFile.findFirst({
      where: { id: fileId, userId: req.user.id },
      include: {
        userFileTags: { include: { tag: true } }
      }
    });

    res.json({
      success: true,
      data: {
        tags:
          withTags?.userFileTags.map((u) => ({
            id: u.tag.id,
            tagName: u.tag.tagName,
            color: u.tag.color
          })) ?? []
      }
    });
  } catch (e) {
    console.error('setFileTags:', e);
    res.status(500).json({ success: false, message: '设置标签失败' });
  }
};
