---
name: feature-kickoff
description: >-
  Kick off a new feature module by decomposing UX first, then choosing a
  technical approach, then writing an implementation plan document. Use when
  starting a new feature (e.g. F-11), beginning a new module, or when the user
  asks to 拆解需求 / 设计方案 / 写实现方案 before coding.
---

# Feature Kickoff（新功能开工三步）

开始写代码前，必须按顺序走完下面三步。**禁止在用户确认方案之前写业务代码。**

开场声明：`我在用 feature-kickoff skill 拆解这个新功能。`

## 进度清单

```
Feature Kickoff Progress:
- [ ] Phase 1: 用户操作 / UX 方案（用户已选定）
- [ ] Phase 2: 技术方案（用户已选定）
- [ ] Phase 3: 实现方案文档已写好，用户确认可对照开发
```

---

## Phase 1 — 拆解用户操作（UX）

**目标：** 说清「用户怎么用」，不是「后端怎么写」。

1. 快速扫一遍现有相关入口（预览弹窗、工具栏、AI 面板、路由等），避免和现有交互打架。
2. 用用户语言拆解操作路径：从哪里进入 → 点什么 → 看到什么 → 失败时怎样。
3. 给出 **推荐 UX 方案**，并说明推荐理由。
4. 若合理方案不止一套：做成 **A / B / C 选择题** 让用户拍板（每套附：步骤、优缺点、工作量粗估）。
5. **停住等用户选择。** 未选定前不进入 Phase 2。

### Phase 1 输出格式

```markdown
## UX 方案

**用户目标：** …
**推荐：方案 X**（理由：…）

### 方案 A：…
- 用户步骤：1. … 2. …
- 优点 / 缺点 / 粗估工期

### 方案 B：…
…

请选择：A / B / C（或组合说明）
```

用词约定：对用户说「产品话」（如「让 AI 读懂文档」），不要堆 Embedding / Worker 等实现词；技术词留给 Phase 2。

---

## Phase 2 — 技术方案（基于已选 UX）

**目标：** 在用户选定的交互前提下，列出落地技术路线。

1. 对照仓库里可复用的模块（API、composables、面板、鉴权、流式等），标出 **复用 vs 新建**。
2. 总结落地所需技术点（API、数据、前后端、边界、测试）。
3. 若技术实现有多套：做成选择题，每套写清：
   - 架构要点
   - 关键技术点 / 库 / 模式
   - 与现有代码的耦合点
   - 风险与取舍
   - 推荐哪套及理由
4. **停住等用户选择。** 未选定前不进入 Phase 3，不写实现文档定稿。

### Phase 2 输出格式

```markdown
## 技术方案（基于 UX：方案 X）

**推荐：技术路线 Y**（理由：…）

### 路线 Y1：…
- 技术点：…
- 复用：…
- 新建：…
- 风险：…

### 路线 Y2：…
…

请选择：Y1 / Y2 / …
```

---

## Phase 3 — 写实现方案文档

**目标：** 产出可在写代码时对照的文档；不是空泛设计散文。

1. 文档路径：`docs/plans/YYYY-MM-DD-<FeatureId或名称>-实现方案.md`（相对本 Nest 仓库根目录）。
2. 文档必须记录：用户选定的 UX + 技术路线（含未选方案的一句话归档，避免以后争论）。
3. 写完后把文档路径发给用户，问：`实现方案是否 OK？确认后我再按文档写代码。`
4. 用户确认前 **仍不写业务实现代码**（可读代码调研可以）。

文档结构模板见 [implementation-doc-template.md](implementation-doc-template.md)。

---

## 硬性规则

- **顺序锁定：** Phase 1 → 2 → 3，不可跳步；用户改 UX 则退回 Phase 1 影响范围。
- **一次只推进一个决策点：** 同一条消息里不要同时让选 UX 又选技术（除非用户明确说「一起定」）。
- **多方案时必须有推荐：** 标明推荐项 + 理由，不要只罗列。
- **对照开发：** 进入编码后以 Phase 3 文档为准；若实现偏离，先更新文档或征得用户同意。
- **与相邻 skill：**
  - 想法仍模糊、要多轮澄清 → 可先用 `brainstorming`，收敛后再用本 skill。
  - Phase 3 之后若要拆成极细 TDD 任务列表 → 可再用 `writing-plans` 细化，但本 skill 的实现方案文档已足够开工时不要重复造两份空文档。

## 完成后

询问用户：`要按实现方案开始写代码吗？`  
若是，再进入实现（可配合 `executing-plans` / TDD 等既有 skill）。
