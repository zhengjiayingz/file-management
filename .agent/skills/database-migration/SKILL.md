---
name: 数据库迁移助手
description: 管理 Prisma 数据库迁移，包括创建、执行和回滚迁移操作
---

# 数据库迁移助手

## 概述
这个技能帮助你安全地管理 Prisma 数据库迁移操作，包括创建迁移文件、执行迁移、回滚更改和查看迁移状态。

## 使用场景
- 需要修改数据库结构（添加/删除表、字段等）
- 需要查看当前数据库迁移状态
- 需要回滚数据库更改
- 需要重置开发数据库

## 前置条件
- 已安装 Prisma CLI
- 已配置 `.env` 文件中的 `DATABASE_URL`
- 位于 `file_management_backend` 目录

## ⚠️ 重要：数据安全

> [!CAUTION]
> **`npx prisma migrate dev` 在某些情况下会删除所有数据！**
> 
> Prisma 在以下情况会重置数据库（删除所有数据）：
> - 迁移历史不一致
> - Schema 变更无法自动迁移（如删除必需字段）
> - 检测到破坏性更改
> 
> **务必在执行迁移前备份数据！**

### 安全迁移策略

#### 开发环境
- 可以使用 `migrate dev`，数据丢失影响较小
- 建议定期备份测试数据

#### 生产环境
- **绝对不要**使用 `migrate dev`
- **必须**使用 `migrate deploy`
- **务必**先备份数据库
- **建议**先在测试环境验证

## 执行步骤

### 1. 查看当前迁移状态
在执行任何迁移操作前，先查看当前状态：
```bash
cd file_management_backend
npx prisma migrate status
```

### 2. 修改 Prisma Schema
编辑 `prisma/schema.prisma` 文件，添加或修改模型定义。

### 3. 创建迁移
根据 schema 变更创建迁移文件：
```bash
npx prisma migrate dev --name 描述性的迁移名称
```

例如：
```bash
npx prisma migrate dev --name add_user_avatar_field
```

### 4. 应用迁移到生产环境
在生产环境中执行迁移（不创建新迁移）：
```bash
npx prisma migrate deploy
```

### 5. 生成 Prisma Client
迁移后更新 Prisma Client：
```bash
npx prisma generate
```

## 数据备份与恢复

### 备份数据库（PostgreSQL）

#### 方法一：使用 pg_dump（推荐）
```bash
# 备份整个数据库
pg_dump -U username -d database_name -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).dump

# 或者备份为 SQL 文件（更易读）
pg_dump -U username -d database_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### 方法二：使用 Prisma Studio 导出数据
1. 运行 `npx prisma studio`
2. 手动导出重要表的数据为 CSV
3. 保存到安全位置

#### 方法三：创建备份脚本
创建 `scripts/backup-db.ts`：

```typescript
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups');
  
  // 创建备份目录
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 备份所有表
  const users = await prisma.user.findMany();
  const files = await prisma.file.findMany();
  const preferences = await prisma.userPreference.findMany();

  const backup = {
    timestamp,
    users,
    files,
    preferences
  };

  const backupPath = path.join(backupDir, `backup_${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  console.log(`✅ 备份完成: ${backupPath}`);
  console.log(`📊 备份统计:`);
  console.log(`   - 用户: ${users.length}`);
  console.log(`   - 文件: ${files.length}`);
  console.log(`   - 偏好设置: ${preferences.length}`);
}

backupDatabase()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('❌ 备份失败:', error);
    prisma.$disconnect();
    process.exit(1);
  });
```

运行备份：
```bash
npx tsx scripts/backup-db.ts
```

### 恢复数据库（PostgreSQL）

#### 从 pg_dump 恢复
```bash
# 从 .dump 文件恢复
pg_restore -U username -d database_name -v backup_file.dump

# 从 .sql 文件恢复
psql -U username -d database_name < backup_file.sql
```

#### 从 JSON 备份恢复
创建 `scripts/restore-db.ts`：

```typescript
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function restoreDatabase(backupFile: string) {
  const backupPath = path.join(__dirname, '../backups', backupFile);
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupPath}`);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

  console.log('⚠️  开始恢复数据库...');
  console.log(`📅 备份时间: ${backup.timestamp}`);

  // 注意：这会覆盖现有数据！
  // 可以选择先清空表或使用 upsert

  // 恢复用户
  for (const user of backup.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: user,
      create: user
    });
  }

  // 恢复其他表...
  console.log('✅ 恢复完成');
}

// 使用示例
const backupFile = process.argv[2];
if (!backupFile) {
  console.error('请指定备份文件名');
  process.exit(1);
}

restoreDatabase(backupFile)
  .then(() => prisma.$disconnect())
  .catch(console.error);
```

## 安全迁移工作流

### 开发环境迁移（保留数据）

#### 方法一：使用 --create-only（推荐）
```bash
# 1. 备份数据
npx tsx scripts/backup-db.ts

# 2. 创建迁移但不应用
npx prisma migrate dev --create-only --name your_migration_name

# 3. 检查生成的迁移 SQL 文件
# 位于: prisma/migrations/[timestamp]_your_migration_name/migration.sql

# 4. 如果 SQL 看起来安全，应用迁移
npx prisma migrate dev

# 5. 如果出错，从备份恢复
npx tsx scripts/restore-db.ts backup_filename.json
```

#### 方法二：使用 db push（仅开发）
```bash
# 1. 备份数据
npx tsx scripts/backup-db.ts

# 2. 直接同步 schema 到数据库（不创建迁移文件）
npx prisma db push

# 注意：db push 会尽量保留数据，但不保证 100% 安全
```

### 生产环境迁移

```bash
# 1. 在开发环境创建并测试迁移
npx prisma migrate dev --name your_migration_name

# 2. 提交迁移文件到版本控制
git add prisma/migrations
git commit -m "Add migration: your_migration_name"

# 3. 在生产服务器上：

# 3.1 备份生产数据库
pg_dump -U username -d production_db -F c -f backup_before_migration.dump

# 3.2 拉取最新代码
git pull

# 3.3 应用迁移（不会重置数据库）
npx prisma migrate deploy

# 3.4 生成 Prisma Client
npx prisma generate

# 3.5 重启应用
pm2 restart app
```

## 常用操作

### 重置开发数据库
⚠️ **警告：这会删除所有数据！**
```bash
npx prisma migrate reset
```

### 查看数据库内容
使用 Prisma Studio 可视化查看数据库：
```bash
npx prisma studio
```

### 回滚迁移
Prisma 不支持直接回滚，需要：
1. 创建新的迁移来撤销更改
2. 或者使用 `migrate reset` 重置数据库

## 注意事项
- ⚠️ **生产环境**：在生产环境执行前务必先在开发环境测试
- 📝 **备份**：执行生产迁移前务必备份数据库
- 🔍 **检查**：仔细检查生成的迁移 SQL 文件
- 📛 **命名**：使用描述性的迁移名称，如 `add_user_preferences_table`
- 🚫 **避免**：不要手动编辑已应用的迁移文件

## 常见问题

### 迁移冲突
如果多人同时创建迁移，可能会出现冲突：
```bash
# 拉取最新代码
git pull
# 重置本地迁移
npx prisma migrate reset
# 重新创建迁移
npx prisma migrate dev
```

### 迁移失败
如果迁移失败：
1. 检查错误信息
2. 修复 schema 问题
3. 使用 `npx prisma migrate resolve` 标记迁移状态
4. 重新执行迁移

## 示例工作流

### 添加新字段
```bash
# 1. 编辑 schema.prisma，添加字段
# 2. 创建迁移
npx prisma migrate dev --name add_user_avatar

# 3. 检查生成的迁移文件
# 4. 测试应用是否正常工作
```

### 添加新表
```bash
# 1. 在 schema.prisma 中定义新模型
# 2. 创建迁移
npx prisma migrate dev --name create_notifications_table

# 3. 生成 Prisma Client
npx prisma generate

# 4. 在代码中使用新模型
```
