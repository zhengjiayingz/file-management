---
name: ai-directory-refactor
description: >-
  Executes the file_management_backend_nest src/files/ai/ directory refactor
  one module at a time (capability first, then app domains): move files, fix
  imports, run jest, give manual test steps, then STOP and wait for user
  confirmation before the next step. Use when the user mentions AI directory
  refactor, ai/ 目录重构, 继续下一个能力迁移, C1/C2 asr chunk, or 按 AI 重构规范.
---

# AI 目录重构（逐步执行）

对本仓库 `file_management_backend_nest` 的 `src/files/ai/` 做搬家重构时，**必须**先读并遵守：

[`docs/plans/2026-07-23-AI目录重构-执行规范.md`](../../../docs/plans/2026-07-23-AI目录重构-执行规范.md)

旧里程碑 [`docs/plans/2026-07-22-AI目录结构重构-里程碑.md`](../../../docs/plans/2026-07-22-AI目录结构重构-里程碑.md) 若与执行规范冲突，**以执行规范为准**。

## 绝对规则（违反即失败）

1. **一次只做一个步骤**（一个 C# 或一个 A#）。禁止同回合搬两个能力模块。
2. 每步顺序固定：**搬家 → 改 import / module → jest 全绿 → 中文手测说明 → 停等用户确认**。
3. 用户未明确说「通过 / 继续 / 下一个 / 确认」之前，**禁止**开始下一步。
4. **只搬家、改路径**；不改业务语义、不做视频/新功能、不升级大依赖。
5. `ai/` 直接子级 = **应用域目录** + **根上 `*.controller.ts`**；禁止 `http/`；能力与 dto 归宿主域（见执行规范 §2～§3）。
6. 域内顶层不放业务文件；实现进 `service|provider|utils|types|processor`；`*.spec.ts` 进 `test/`；controller 只放 `ai/` 根。
7. 禁止 `../../`；域内用 `@/files/ai/<域>/<类型>/...`；controller 用 `@/files/ai/<name>.controller`。

### 禁止合理化

| 借口 | 正确做法 |
|------|----------|
| 「测试都绿了，顺手做下一个」 | 先交手测说明并等待确认 |
| 「用户说过执行整个计划」 | 仍逐步停等；计划 ≠ 连做多步 |
| 「两个能力模块很小，一起搬更快」 | 仍然一次一个 |
| 「手测可有可无」 | 必须给出可执行手测清单 |
| 「先建 shared/ 过渡」 | 禁止；直接挂宿主应用域 |

## 每次被触发时的工作流

```
1. Read 执行规范.md（含进度表 §5）
2. 确认当前要做的步骤 ID（与用户对齐；默认下一个未勾选的 C# 或 A#）
3. 仅执行该步骤的文件移动与 import / module 更新
4. cd file_management_backend_nest
   pnpm exec jest <本步相关路径> --no-coverage
5. 失败 → 修复 → 重跑，直到通过
6. 勾选执行规范 §5 中对应 [x]（并写日期）
7. 回复用户：本步做了什么 + 手测清单（用执行规范 §6 裁剪）+ 明确「请确认通过后再说继续」
8. END TURN — 不要开始下一步
```

## 步骤速查

**能力层（先做）：** C1 asr→index → C2 chunk→index → C3 OCR→index → C4 文本 embedding→index → C5 图像 embedding→image-search → C6 math-vision→math → C7 chat utils+dto→chat  

**应用层（能力全部确认后）：** A1 tts → A2 index 服务/processor → A3 chat 服务 → A4 summary/knowledge → A5 math/translate → A6 image-search/assistant → A7 根上 controller 归位 → A8 清根 DoD  

细节路径与宿主表见执行规范，不要凭记忆发明目录。

## 手测说明模板（每步回复末尾必须有）

```markdown
### 本步手测
1. …（入口）
2. …（操作）
3. 预期：…

请手测通过后回复「继续」或「通过」，我再做下一步（…下一步 ID…）。
```

## DoD（整次重构结束时）

对照执行规范 §7：根目录 = 应用域 + `*.controller.ts`（无 `http/`）、全量 `jest src/files/ai`、里程碑标 ✅、下一步为视频抽音轨。
