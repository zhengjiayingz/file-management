# S13 分层摘要 + 体裁化结构化输出 — Implementation Plan

> **For Claude / 自用：** 按 Task 顺序执行，每 Task 验收后再进下一项。  
> **Goal：** 索引时按用户所选 **体裁（6 类）** 异步生成 Map-Reduce 摘要，结构化 JSON 入库；用户通过 `GET summary` 读库展示，不实时跑全书 LLM。  
> **范围：** F-03（核心）、F-04 主题分析（可选同迭代）、F-05 PDF 文本索引（可并行子线）。  
> **不在 S13：** 会议纪要、合同摘要（延后）；F-25 视频总结（S17b）。  
> **设计文档：** [2026-07-08-ai-capability-roadmap-design.md](./2026-07-08-ai-capability-roadmap-design.md) §7.1、§9 阶段 2  
> **PRD：** [2026-07-08-ai-features-prd.md](./2026-07-08-ai-features-prd.md) F-03、F-04、F-05  
> **前置：** S12 已完成（`DocumentIndexJob`、`DocumentChunk`、索引 + RAG）  
> **Tech Stack：** NestJS 11、BullMQ、`ai` v7 `generateObject`、Zod、Prisma、Jest e2e

**建议启动：** S12 合并 `main` 后，W2（07-16～07-22）

---

## 端点范围（S13 核心）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/files/:id/ai/index` | POST | Body 扩展：`{ mode, summaryGenre }`（见下表） |
| `/api/files/:id/ai/index/status` | GET | 含 `summarizing` 阶段与 `progressMsg` |
| `/api/files/:id/ai/summary` | GET | Query: `type=book\|chapter\|chunk`，`chapterNo?` |
| `/api/files/:id/ai/analyze` | POST | **可选 F-04** `{ type: 'theme' }`，流式 |

**不变：** `POST .../ai/ask`、`POST .../ai/rag-ask`（摘要与 RAG 分工：总览读 summary，细节问 RAG）

---

## 体裁（`summaryGenre`）— 6 项 MVP

用户建索引时必选；存入 `DocumentIndexJob.summaryGenre`。

| 枚举值 | 中文（UI） | `indexMode` | 全书 Zod 家族 |
|--------|------------|-------------|---------------|
| `novel` | 小说 | `general` | `narrative` |
| `general_nonfiction` | 通识读物（历史/传记/非虚构） | `general` | `narrative`（不同 Prompt） |
| `technical` | 技术文档 | `general` | `instructional` |
| `textbook` | 教材/讲义 | `general` | `instructional`（不同 Prompt） |
| `lab_report` | 实验报告 | `academic` | `academic` |
| `paper` | 期刊论文 | `academic` | `academic`（更多 optional 字段） |

**实现策略：**

- **6 套 Prompt**（`buildChunkPrompt` / `buildBookPrompt`）  
- **4 套全书 Zod schema**（`narrative`×2 文案、`instructional`×2 文案、`academic` 共用结构，`paper` 字段更全）  
- **chunk 层**：1 套通用短摘要 schema + 体裁 Prompt 约束  

**延后：** `meeting_minutes`、`contract`

---

## 全书摘要字段草案（`type=book`，实施时写入 `summary.schemas.ts`）

### `novel`

- `oneLiner`、`overview`、`plotPoints[]`、`characters[{ name, role }]`、`themes[]`（optional）

### `general_nonfiction`

- `oneLiner`、`overview`、`timeScope`、`timeline[{ period, event }]`、`keyFigures[{ name, significance }]`、`causesAndEffects[]`

### `technical` / `textbook`（共用 `instructionalBookSchema`）

- `purpose`、`overview`、`sections[{ title, summary }]`、`keyPoints[]`、`prerequisites[]`（optional）  
- Prompt 区分：技术偏步骤/API/注意；教材偏定义/章节脉络/例题类型

### `lab_report` / `paper`（共用 `academicBookSchema`）

- `researchQuestion`、`method`、`keyFindings[]`、`conclusions[]`、`limitations[]`（optional）  
- `paper` 额外 optional：`contributions[]`、`relatedWork`、`futureWork`

---

## Map-Reduce 流程（Worker 内）

```
embedding 完成（或并行前置于 summarizing）
    ↓
status → summarizing, progressMsg=正在生成块摘要…
    ↓
Map: 每个 DocumentChunk → generateObject(chunkSummarySchema) → 写入 DocumentSummary type=chunk, refKey=chunk:{index}
    ↓
Reduce（有 chapterNo 时）: 同章 chunk 摘要合并 → type=chapter, refKey=chapter:{no}
    ↓
Reduce: 全书（输入 chapter 或 chunk 摘要 JSON，禁止扫原文）→ type=book, refKey=book
    ↓
status → ready, progress=100
```

**短文策略：** 块数 ≤ N（如 3）时跳过中间 chapter，chunk 摘要直接 Reduce 为 book。

**Prompt 共用底座：** 仅根据原文/下级摘要；不足则 `null`/`[]`；禁止编造；回答/摘要中不出现「片段 N」等内部标记。

---

## 阶段 0（Day 1 上午）

### Task 0.1 分支与基线

```powershell
cd f:\code\FileManagement_proj\file_management_backend_nest
git checkout -b feature/s13-ai-summary
pnpm test:e2e -- test/e2e/files-ai-index.e2e-spec.ts test/e2e/files-ai-rag.e2e-spec.ts
```

确认 S12 e2e 全绿后再开发。

---

### Task 0.2 依赖

确认 `package.json` 含 `zod`；`ai` v7 支持 `generateObject`（与 F-06 一致）。

Run: `pnpm build`

---

## Task 1.1 Prisma：`DocumentSummary` + `summaryGenre`

**Modify:** `prisma/schema.prisma`

```prisma
enum SummaryGenre {
  novel
  general_nonfiction
  technical
  textbook
  lab_report
  paper
}

enum DocumentSummaryType {
  chunk
  chapter
  book
  theme    // F-04 预留
}

model DocumentSummary {
  id         Int                  @id @default(autoincrement())
  userFileId Int                  @map("user_file_id")
  type       DocumentSummaryType
  refKey     String               @map("ref_key") @db.VarChar(64)
  payload    Json                 // 结构化摘要 JSON（Zod 校验后写入）
  createdAt  DateTime             @default(now()) @map("created_at")
  updatedAt  DateTime             @updatedAt @map("updated_at")

  userFile UserFile @relation(fields: [userFileId], references: [id], onDelete: Cascade)

  @@unique([userFileId, type, refKey])
  @@map("document_summaries")
}
```

**Modify:** `DocumentIndexJob` 增加 `summaryGenre SummaryGenre?`（可空兼容旧 job；新索引必填）

Run: `pnpm exec prisma migrate dev --name add_document_summary`

**验收：** `pnpm prisma:generate && pnpm build`

---

## Task 1.2 体裁与 Schema 模块

**Create:**

- `src/files/ai/summary/summary-genre.types.ts` — 枚举、UI 标签、`toIndexMode()`、`pickBookSchema(genre)`
- `src/files/ai/summary/summary.schemas.ts` — Zod：`chunkSummarySchema`、`narrativeBookSchema`、`instructionalBookSchema`、`academicBookSchema`
- `src/files/ai/summary/summary.prompt.ts` — `buildChunkPrompt(genre)`、`buildBookPrompt(genre)`、`BASE_RULES`

**验收：** Jest 单测 — 合法/非法 JSON 对 schema 的 `safeParse`；6 个 genre 均能 `pickBookSchema`

---

## Task 1.3 Map-Reduce 服务

**Create:**

- `src/files/ai/summary/summary-map-reduce.service.ts`

**职责：**

- `summarizeChunks(userFileId, genre, chunks[])` — Map，批量 `generateObject`（注意 API 并发与 token）
- `reduceChapters(...)` — 按 `chapterNo` 分组 Reduce（无 chapterNo 则跳过）
- `reduceBook(userFileId, genre, intermediateSummaries[])` — 全书 JSON
- `persistSummary(...)` — upsert `DocumentSummary`

**Modify:** `src/files/ai/utils/chat-model.provider.ts` — 如需摘要专用便宜模型，可读 `AI_SUMMARY_MODEL`（optional）

**验收：** 单测 mock `generateObject`；3 chunk mock 文本 → DB 有 3 条 chunk + 1 条 book summary

---

## Task 1.4 扩展 Index API + Processor

**Modify:**

- `src/files/ai/files-ai-index.service.ts` — `validateSummaryGenre(body)`；`triggerIndex` 写入 `summaryGenre`；reindex 时 `deleteMany` summaries
- `src/files/ai/document-index-queue.types.ts` — job data 带 `summaryGenre`
- `src/files/ai/document-index.processor.ts` — embedding 后调用 `SummaryMapReduceService`；`patchJob` 更新 `summarizing` / progressMsg

**Processor 顺序（更新）：**

1. extracting → chunking → embedding（同 S12）
2. **summarizing** — Map-Reduce → 写 `DocumentSummary`
3. ready

**验收：** 手测上传 txt → POST index `{ summaryGenre: 'novel' }` → status 经历 summarizing → ready；`document_summaries` 有 `type=book`

---

## Task 1.5 Summary 读 API

**Create:**

- `src/files/ai/files-ai-summary.service.ts` — `getSummary(userId, fileId, { type, chapterNo })`；校验 index ready；读库返回 `payload`

**Modify:**

- `src/files/ai/files-ai.controller.ts` — `GET :id/ai/summary`
- `src/files/files.module.ts` — 注册 providers

**响应示例：**

```json
{
  "success": true,
  "data": {
    "type": "book",
    "refKey": "book",
    "summaryGenre": "novel",
    "payload": { "oneLiner": "...", "overview": "...", "plotPoints": [] }
  }
}
```

**验收：** `pnpm build`；未索引 / 无 summary → 409 或 404

---

## Task 1.6 E2E

**Create:** `test/e2e/files-ai-summary.e2e-spec.ts`

**Mock:**

```typescript
jest.mock('ai', () => ({
  generateObject: jest.fn().mockResolvedValue({
    object: { oneLiner: 'mock', overview: 'mock', plotPoints: ['a'] },
  }),
  streamText: jest.fn(/* 保留 rag 兼容 */),
}));
```

**用例：**

- 无 Token → 401
- POST index 无 `summaryGenre` → 400（或默认 `technical`，在实现时二选一并写死测试）
- 索引完成 → GET summary type=book → 200 + payload 含预期 key
- 第二次 GET → 不调 LLM（mock 调用次数不变）
- reindex 后 summary 更新

**Modify:** `test/helpers/files.helper.ts` — `seedDocumentSummary(...)` 可选

Run: `pnpm test:e2e -- test/e2e/files-ai-summary.e2e-spec.ts`

---

## Task 1.7 前端：体裁选择 + 摘要 Tab

**Modify:**

- `file_management_frontend/src/api/ai.ts` — `triggerDocumentIndex(fileId, { mode, summaryGenre })`；`getDocumentSummary(fileId, params)`
- `TextChunkPreviewDialog` 或等价入口 — 建索引前下拉 **6 体裁**（分组：阅读 / 学习 / 科研）
- 新增 `SummaryPanel.vue`（或子组件）— `switch(summaryGenre)` 渲染不同卡片字段
- 轮询 `index/status`，`summarizing` 时展示 `progressMsg`

**验收：** 联调：选小说 → 索引完成 → 摘要 Tab 展示结构化字段；RAG Tab 仍可用

---

## Task 1.8 文档

**Modify:**

- `MIGRATION.md` — 追加 `GET /api/files/:id/ai/summary`、`POST index` body 扩展
- `2026-07-08-ai-features-prd.md` §9 — 链接本文

---

## 可选同迭代（S13 加量）

### Task 2.x F-04 主题分析（+2～3 天）

**Create:** `files-ai-analyze.service.ts` — 读 `DocumentSummary` book/chapter → `streamText` 或 `generateObject` → `type=theme`

**Endpoint:** `POST /api/files/:id/ai/analyze { type: 'theme' }`

**验收：** mock 文本生成 3～5 主题，不调用 RAG 扫全书

---

### Task 3.x F-05 PDF 文本索引（+2～3 天）

**Modify:** `text-extractor.ts` — `application/pdf` + pdf-parse 或预览链路

**验收：** 小文字 PDF index → summary + rag-ask 可用；扫描 PDF → 明确错误

---

## S13 验收清单（F-03 核心）

- [ ] `pnpm build`
- [ ] `pnpm test:e2e` 全绿（含 `files-ai-summary` spec）
- [ ] 6 体裁至少各手测 1 例（或 e2e 覆盖 2 体裁 + 单测覆盖 schema 选型）
- [ ] 3 章 mock 长文 → book + chapter summaries 入库
- [ ] 二次 `GET summary` 读库，不重复调 LLM
- [ ] `summarizing` 进度在前端可见
- [ ] 划词 `ai/ask`、RAG `rag-ask` 仍正常
- [ ] `MIGRATION.md` 已更新

**已知边界（MVP）：**

- 分块仍 primarily 按字数（800/overlap 100）；按章/section 智能分块可后续增强
- `novel` 与 `general_nonfiction` 共用 narrative schema，靠 Prompt 区分
- 体裁错误可由用户 reindex 重选（依赖现有 `indexedFileHash` 逻辑）

---

## Day 8～14 建议排期

| Day | 日期（参考） | 内容 |
|-----|----------------|------|
| 8 | 07-16 | Task 0 + 1.1 Prisma + 1.2 schema/prompt |
| 9 | 07-17 | Task 1.3 Map-Reduce |
| 10 | 07-18 | Task 1.4 Processor 挂钩 |
| 11 | 07-19 | Task 1.5 Summary API |
| 12 | 07-20 | Task 1.6 E2E |
| 13 | 07-21 | Task 1.7 前端 |
| 14 | 07-22 | Task 1.8 文档 + 缓冲；或启动 F-04 / F-05 |

---

## 完成后

- 进入 **S14**（F-06 学术知识卡片，`DocumentKnowledge` + section 抽取）  
- 或并行 **F-05 PDF** 若 S13 未做  
- 视频摘要见 PRD **F-25（S17b）**，复用本文 Map-Reduce + `generateObject` 模式

---

## 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-07-09 | 初版：6 体裁结构化摘要、Map-Reduce、Task 1.1～1.8 |
