# Skills 使用指南

这个目录包含了文件管理系统的各种技能（Skills），用于帮助 AI 助手更好地协助你完成常见任务。

## 什么是 Skill？

Skill 是一组结构化的指令和资源，用于指导 AI 助手执行特定任务。每个 skill 包含：
- **SKILL.md** - 主要指令文件，包含详细的步骤和说明
- **scripts/** - 辅助脚本（可选）
- **examples/** - 示例代码（可选）
- **resources/** - 其他资源文件（可选）

## 可用的 Skills

### 1. 数据库迁移助手 (`database-migration`)
**用途**：管理 Prisma 数据库迁移操作

**使用场景**：
- 修改数据库结构
- 创建新的数据表
- 添加或修改字段
- 查看迁移状态

**快速开始**：
```bash
cd file_management_backend
npx prisma migrate dev --name your_migration_name
```

### 2. 开发环境启动助手 (`dev-server`)
**用途**：快速启动前后端开发服务器

**使用场景**：
- 开始开发工作
- 调试前后端交互
- 测试新功能

**快速开始**：
```bash
# 终端 1 - 启动后端
cd file_management_backend
pnpm run dev

# 终端 2 - 启动前端
cd file_management_frontend
pnpm run dev
```

### 3. 用户管理助手 (`user-management`)
**用途**：管理系统用户和权限

**使用场景**：
- 创建管理员账户
- 重置用户密码
- 管理用户角色
- 查看用户列表

**快速开始**：
```bash
cd file_management_backend
npx tsx scripts/create-admin.ts
```

### 4. pnpm 包管理助手 (`pnpm-package-management`)
**用途**：使用 pnpm 管理项目依赖

**使用场景**：
- 安装项目依赖
- 添加新的依赖包
- 更新依赖版本
- 管理 monorepo 工作空间

**快速开始**：
```bash
# 安装依赖
pnpm install

# 添加依赖
pnpm add package-name

# 添加开发依赖
pnpm add -D package-name
```

### 5. API 文档助手 (`api-documentation`)
**用途**：指导添加标准的 Swagger/OpenAPI 文档注释

**使用场景**：
- 新增或修改后端接口时
- 修复文档错误时
- 查找文档编写模板时

**快速参考**：
请查看 [SKILL.md](api-documentation/SKILL.md) 获取详细的注释模板。

### 6. 前端开发助手 (`frontend-development`)
**用途**：指导前端 TypeScript 类型定义、API 封装和 Vue 组件开发规范

**使用场景**：
- 编写新的前端 API 调用时
- 定义新的 TypeScript 接口时
- 开发 Vue 组件遇到类型问题时

**快速参考**：
请查看 [SKILL.md](frontend-development/SKILL.md) 获取代码模板。


## 如何使用 Skills

### 方式一：直接查看文档
直接打开对应的 `SKILL.md` 文件查看详细说明：
```bash
# 例如查看数据库迁移助手
cat .agent/skills/database-migration/SKILL.md
```

### 方式二：通过 AI 助手
当你向 AI 助手提出相关请求时，它会自动识别并使用相应的 skill。例如：
- "帮我创建一个数据库迁移" → 使用 `database-migration` skill
- "启动开发服务器" → 使用 `dev-server` skill
- "创建一个管理员账户" → 使用 `user-management` skill

## 创建自定义 Skill

如果你需要创建自己的 skill：

1. **创建 skill 目录**：
```bash
mkdir .agent/skills/your-skill-name
```

2. **创建 SKILL.md 文件**：
```markdown
---
name: 你的技能名称
description: 简短描述
---

# 技能名称

## 概述
详细说明...

## 使用场景
- 场景 1
- 场景 2

## 执行步骤
1. 步骤 1
2. 步骤 2
```

3. **添加辅助资源**（可选）：
```bash
mkdir .agent/skills/your-skill-name/scripts
mkdir .agent/skills/your-skill-name/examples
```

## Skill 最佳实践

### ✅ 好的 Skill
- 指令清晰、具体、可执行
- 包含实际的命令示例
- 说明前置条件和依赖
- 提供故障排查指南
- 包含安全注意事项

### ❌ 避免
- 模糊的描述
- 缺少具体步骤
- 忽略错误处理
- 过于复杂的嵌套

## 维护 Skills

### 更新 Skill
当项目结构或工作流程变化时，记得更新相应的 skill：
1. 编辑 `SKILL.md` 文件
2. 更新命令和路径
3. 添加新的场景或步骤
4. 测试更新后的指令

### 版本控制
Skills 应该纳入版本控制：
```bash
git add .agent/skills/
git commit -m "Add/Update skill: skill-name"
```

## 常见问题

### Q: Skill 和 Workflow 有什么区别？
**A**: 
- **Skill** 是通用的指导方针，适用于某一类任务
- **Workflow** 是具体的步骤序列，用于完成特定任务

### Q: 如何知道哪个 Skill 适合我的任务？
**A**: 查看每个 skill 的 `description` 和"使用场景"部分，或者直接向 AI 助手描述你的需求。

### Q: 可以修改现有的 Skill 吗？
**A**: 可以！根据你的项目需求自由修改。建议保留原始结构，只更新具体内容。

## 贡献

如果你创建了有用的 skill，欢迎分享给团队：
1. 确保 skill 文档完整
2. 测试所有命令和步骤
3. 提交 Pull Request

## 资源

- [Prisma 文档](https://www.prisma.io/docs)
- [Vue 3 文档](https://vuejs.org/)
- [Express 文档](https://expressjs.com/)
- [项目 README](../../README.md)
