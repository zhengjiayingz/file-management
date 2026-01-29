# .agent 目录说明

这个目录包含了 AI 助手的配置、技能和工作流，用于提升开发效率和自动化常见任务。

## 目录结构

```
.agent/
├── README.md          # 本文件
├── skills/            # AI 助手技能库
│   ├── README.md
│   ├── database-migration/    # 数据库迁移助手
│   ├── dev-server/           # 开发环境启动助手
│   └── user-management/      # 用户管理助手
└── workflows/         # 工作流定义（可选）
```

## Skills（技能）

Skills 是结构化的指令集，帮助 AI 助手执行特定类型的任务。

### 已配置的 Skills

1. **数据库迁移助手** - 管理 Prisma 数据库迁移
2. **开发环境启动助手** - 快速启动前后端服务器
3. **用户管理助手** - 管理用户账户和权限

详细信息请查看 [skills/README.md](skills/README.md)

## Workflows（工作流）

Workflows 是具体的步骤序列，用于完成特定任务。你可以在 `workflows/` 目录中创建自定义工作流。

### 创建 Workflow

创建文件 `.agent/workflows/your-workflow.md`：

```markdown
---
description: 工作流简短描述
---

# 工作流名称

1. 第一步操作
2. 第二步操作
3. 第三步操作
```

### 使用 Workflow

向 AI 助手提及工作流名称，它会自动读取并执行相应步骤。

## 如何使用

### 自动使用
当你向 AI 助手提出请求时，它会自动识别并使用相关的 skill 或 workflow。

**示例**：
- "帮我创建数据库迁移" → 自动使用 `database-migration` skill
- "启动开发服务器" → 自动使用 `dev-server` skill

### 手动查看
你也可以直接查看这些文档作为参考：
```bash
# 查看所有 skills
ls .agent/skills/

# 查看特定 skill
cat .agent/skills/database-migration/SKILL.md
```

## 自定义和扩展

### 添加新 Skill

1. 创建目录：
```bash
mkdir .agent/skills/your-skill-name
```

2. 创建 SKILL.md：
```markdown
---
name: 技能名称
description: 简短描述
---

# 详细说明...
```

### 修改现有 Skill

直接编辑对应的 `SKILL.md` 文件，根据项目需求调整指令。

## 最佳实践

### ✅ 推荐
- 保持 skill 文档更新
- 使用清晰的命令示例
- 包含错误处理说明
- 添加安全注意事项

### ❌ 避免
- 过时的指令
- 模糊的描述
- 缺少示例
- 忽略边界情况

## 版本控制

`.agent` 目录应该纳入版本控制，这样团队成员可以共享相同的工作流和技能。

```bash
git add .agent/
git commit -m "Add AI assistant skills and workflows"
```

## 贡献

如果你创建了有用的 skill 或 workflow：
1. 确保文档完整清晰
2. 测试所有步骤
3. 与团队分享

## 相关资源

- [项目 README](../README.md)
- [Skills 详细说明](skills/README.md)
- [项目需求文档](../docs/REQUIREMENTS.md)

---

**注意**：这个目录是为 AI 助手设计的，但所有文档都是人类可读的，你可以随时查看作为参考。
