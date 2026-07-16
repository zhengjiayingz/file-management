import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { KnowledgeBasesAccessHelper } from '../helpers/knowledge-bases-access.helper';

@Injectable()
export class KnowledgeBasesService {
  /** 注入 Prisma 与归属校验 helper */
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KnowledgeBasesAccessHelper,
  ) {}

  /** 列出当前用户的全部知识库（按更新时间倒序） */
  list(userId: number) {
    return this.prisma.knowledgeBase.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 列出指定知识库内的文件条目（含文件名等摘要信息） */
  async listItems(userId: number, knowledgeBaseId: number) {
    await this.access.requireOwned(userId, knowledgeBaseId);
    return this.prisma.knowledgeBaseItem.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
      include: {
        userFile: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            isDeleted: true,
          },
        },
      },
    });
  }

  /** 把用户自己的未删除普通文件加入知识库（校验归属、去重、禁文件夹） */
  async addItem(
    userId: number,
    knowledgeBaseId: number,
    input: { userFileId?: unknown },
  ) {
    await this.access.requireOwned(userId, knowledgeBaseId);
    const userFileId =
      typeof input.userFileId === 'number'
        ? input.userFileId
        : typeof input.userFileId === 'string' &&
            /^\d+$/.test(input.userFileId.trim())
          ? parseInt(input.userFileId.trim(), 10)
          : NaN;
    if (!Number.isFinite(userFileId) || userFileId <= 0) {
      throw new BadRequestException('userFileId 无效');
    }

    const userFile = await this.prisma.userFile.findFirst({
      where: { id: userFileId, userId, isDeleted: false },
      select: { id: true, fileType: true, fileName: true },
    });
    if (!userFile) {
      throw new NotFoundException('文件不存在');
    }
    if (userFile.fileType === 'folder') {
      throw new BadRequestException('不能将文件夹加入知识库');
    }

    const existed = await this.prisma.knowledgeBaseItem.findUnique({
      where: {
        knowledgeBaseId_userFileId: { knowledgeBaseId, userFileId },
      },
    });
    if (existed) {
      throw new ConflictException('该文件已在知识库中');
    }

    return this.prisma.knowledgeBaseItem.create({
      data: { knowledgeBaseId, userFileId },
      include: {
        userFile: {
          select: { id: true, fileName: true, fileType: true },
        },
      },
    });
  }

  /** 从知识库移除指定文件关联（不删网盘文件本身） */
  async removeItem(
    userId: number,
    knowledgeBaseId: number,
    userFileId: number,
  ) {
    await this.access.requireOwned(userId, knowledgeBaseId);
    const item = await this.prisma.knowledgeBaseItem.findUnique({
      where: {
        knowledgeBaseId_userFileId: { knowledgeBaseId, userFileId },
      },
    });
    if (!item) {
      throw new NotFoundException('知识库中不存在该文件');
    }
    await this.prisma.knowledgeBaseItem.delete({ where: { id: item.id } });
    return { success: true, message: '已从知识库移除' };
  }

  /** 创建知识库（name 必填，description 可选） */
  async create(
    userId: number,
    input: { name?: unknown; description?: unknown },
  ) {
    const data = this.parseNameDescription(input, { nameRequired: true });
    return this.prisma.knowledgeBase.create({
      data: { userId, ...data },
    });
  }

  /** 更新自己的知识库名称和/或描述（至少传一个字段） */
  async update(
    userId: number,
    id: number,
    input: { name?: unknown; description?: unknown },
  ) {
    await this.access.requireOwned(userId, id);
    const data = this.parseNameDescription(input, { nameRequired: false });
    if (data.name === undefined && data.description === undefined) {
      throw new BadRequestException('请至少提供 name 或 description');
    }
    return this.prisma.knowledgeBase.update({
      where: { id },
      data,
    });
  }

  /** 删除自己的知识库（级联清理 items / sessions / messages） */
  async remove(userId: number, id: number) {
    await this.access.requireOwned(userId, id);
    await this.prisma.knowledgeBase.delete({ where: { id } });
    return { success: true, message: '已删除' };
  }

  /** create 场景：name 必填，返回带 name 的对象 */
  private parseNameDescription(
    input: { name?: unknown; description?: unknown },
    opts: { nameRequired: true },
  ): { name: string; description?: string | null };

  /** update 场景：未传的字段不写入 */
  private parseNameDescription(
    input: { name?: unknown; description?: unknown },
    opts: { nameRequired: false },
  ): { name?: string; description?: string | null };

  /** 解析并校验 name / description 入参，供 create / update 共用 */
  private parseNameDescription(
    input: { name?: unknown; description?: unknown },
    opts: { nameRequired: boolean },
  ): { name?: string; description?: string | null } {
    const data: { name?: string; description?: string | null } = {};

    if (input.name !== undefined || opts.nameRequired) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name || name.length > 100) {
        throw new BadRequestException('name 必填且不超过 100 字');
      }
      data.name = name;
    }

    if (input.description !== undefined) {
      if (input.description != null && typeof input.description !== 'string') {
        throw new BadRequestException('description 须为字符串');
      }
      const description =
        typeof input.description === 'string'
          ? input.description.trim() || null
          : null;
      if (description && description.length > 500) {
        throw new BadRequestException('description 不超过 500 字');
      }
      data.description = description;
    }

    return data;
  }

  /**
   * 聚合知识库内所有文件的索引状态，供前端展示「能否提问」
   * 与单文件 RAG 一致：无 job 或 status !== ready 都算未就绪
   */
  async getIndexStatus(userId: number, knowledgeBaseId: number) {
    await this.access.requireOwned(userId, knowledgeBaseId);

    const items = await this.prisma.knowledgeBaseItem.findMany({
      where: { knowledgeBaseId },
      select: {
        userFileId: true,
        userFile: { select: { id: true, fileName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const userFileIds = items.map((i) => i.userFileId);
    const jobs =
      userFileIds.length === 0
        ? []
        : await this.prisma.documentIndexJob.findMany({
            where: { userFileId: { in: userFileIds } },
            select: { userFileId: true, status: true },
          });
    // 构造一个文件 ID 到索引状态的映射
    const statusByFileId = new Map(
      jobs.map((j) => [j.userFileId, j.status] as const),
    );
    // 将 items 映射为更易用的结构
    const files = items.map((item) => {
      const indexStatus = statusByFileId.get(item.userFileId) ?? null;
      return {
        userFileId: item.userFileId,
        fileName: item.userFile.fileName,
        indexStatus,
        ready: indexStatus === 'ready',
      };
    });

    const readyCount = files.filter((f) => f.ready).length;
    const total = files.length;
    const notReadyFiles = files
      .filter((f) => !f.ready)
      .map(({ userFileId, fileName, indexStatus }) => ({
        userFileId,
        fileName,
        indexStatus,
      }));
    return {
      total,
      readyCount,
      canAsk: total > 0 && readyCount === total,
      files,
      notReadyFiles,
    };
  }

  /**
   * 供后续 chat 使用：库非空且全员索引 ready，否则抛 409，并带上未就绪文件名
   */
  async assertReadyForChat(userId: number, knowledgeBaseId: number) {
    const status = await this.getIndexStatus(userId, knowledgeBaseId);
    if (status.total === 0) {
      throw new BadRequestException('知识库内没有文件');
    }
    if (!status.canAsk) {
      const names = status.notReadyFiles.map((f) => f.fileName).join('、');
      throw new ConflictException(
        `请先完成索引后再提问。未就绪：${names || '未知文件'}`,
      );
    }
    return status;
  }
}
