# S12 文档索引 + RAG 问答 — Implementation Plan

> **For Claude / 自用：** 按 Task 顺序执行，每 Task 验收后再进下一项。  
> **Goal：** 上传 TXT/MD → 异步索引（分块 + Embedding）→ `POST /api/files/:id/ai/rag-ask` 流式问答。  
> **设计文档：** [2026-07-08-ai-capability-roadmap-design.md](./2026-07-08-ai-capability-roadmap-design.md) §9 阶段 1  
> **Tech Stack：** NestJS 11、BullMQ、`ai` v7、Prisma、MySQL JSON embedding、Jest e2e

**启动日：** 2026-07-09（阶段 0 + Task 1.1 起）

---

## 端点范围（S12）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/files/:id/ai/index` | POST | Body: `{ mode: 'general' \| 'academic' }`，默认 general |
| `/api/files/:id/ai/index/status` | GET | 索引状态与进度 |
| `/api/files/:id/ai/rag-ask` | POST | Body: `{ question, messages? }`，text/plain 流式 |

**不变：** `POST /api/files/:id/ai/ask` 划词问答

---

## 阶段 0（Day 1 上午）

### Task 0.1 分支与环境

```powershell
cd f:\code\FileManagement_proj\file_management_backend_nest
git checkout -b feature/ai-document-intelligence
```

`.env.example` 追加：

```env
AI_API_KEY=
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_MAX_INDEX_CHUNKS=500
AI_DAILY_ASK_LIMIT=100
```

Run: `pnpm test:e2e -- test/e2e/files-ai.e2e-spec.ts` — 确认 S3 基线绿

---

### Task 0.2 Prisma 迁移（IndexJob + Chunk）

**Files:**
- Modify: `prisma/schema.prisma` — 按设计文档 §5 添加 `DocumentIndexJob`、`DocumentChunk`、enum、`UserFile` relations
- Run: `pnpm exec prisma migrate dev --name add_document_index`

**验收：** `pnpm prisma:generate && pnpm build`

---

## Task 1.1 文本提取

**Create:**
- `src/files/ai/chunk/text-extractor.ts`

**逻辑：**
- 从 `StorageService` 读文件 buffer/stream
- 允许 mime：`.txt`、`.md`（扩展名 + mime 双判断）
- UTF-8；失败抛 `UnsupportedDocumentFormatError`

**验收：** 单元测试或临时 script 读 uploads 下测试文件

---

## Task 1.2 分块

**Create:**
- `src/files/ai/chunk/text-chunker.ts`

**参数：**
- `chunkSize = 800`，`overlap = 100`
- 尊重 `AI_MAX_INDEX_CHUNKS`，超出截断并 log warn

**导出：** `chunkText(fullText: string): Array<{ index, content }>`

**验收：** Jest 单测 — 2000 字文本 → 预期块数

---

## Task 1.3 Embedding Provider

**Create:**
- `src/files/ai/embedding/embedding.provider.ts`
- `src/files/ai/embedding/similarity.util.ts`

**embedding.provider：**
- 调用 OpenAI-compatible `POST /embeddings`（`AI_BASE_URL` + `AI_EMBEDDING_MODEL`）
- `embedMany(texts: string[]): Promise<number[][]>`，batch ≤ 32

**similarity.util：**
- `cosineSimilarity(a: number[], b: number[]): number`
- `topKByEmbedding(query: number[], items: { id, embedding }[], k): ids[]`

**验收：** 单测 cosine；集成手测 2 条相似句

---

## Task 1.4 Index Service + Processor

**Create:**
- `src/files/ai/files-ai-index.service.ts`
- `src/files/ai/document-index.processor.ts`
- Modify: `src/jobs/jobs.module.ts` 或新建 `document-index.module.ts` 注册 Queue

**Processor 步骤：**
1. status → extracting
2. text-extractor
3. status → chunking；bulk insert `DocumentChunk`
4. status → embedding；batch embed；update chunk.embedding JSON
5. status → ready；progress=100

**失败：** status=failed，errorMessage 写入

**Index Service：**
- `triggerIndex(userId, fileId, mode)` — 校验文件归属、格式、无并发 job
- `getIndexStatus(userId, fileId)`

**Worker：** 在 `worker.main.ts` 或 `preview-worker.module.ts` 注册 processor（与 preview 并列）

**验收：**
- 手测：上传 txt → POST index → Worker 日志 → GET status = ready
- DB：`document_chunks` 行数 > 0，embedding 非 null

---

## Task 1.5 RAG Service + Controller

**Create:**
- `src/files/ai/files-ai-rag.service.ts`

**Modify:**
- `src/files/ai/files-ai.controller.ts` — 新端点
- `src/files/files.module.ts` — 注册 providers

**rag-ask 流程：**
1. 校验 index status = ready
2. embed(question)
3. topK chunks（K=6）
4. buildRagPrompt(chunks, question, history)
5. `streamText` + `pipeTextStreamToResponse` + abort（对齐 `files-ai.service.ts`）

**Prompt 要点：**
- 仅根据【检索片段】回答
- 片段不足则说明不知道
- 可标注 `[片段 N]`

**验收：** `pnpm build`；手测 rag-ask 流式

---

## Task 1.6 E2E

**Create:**

- `test/e2e/files-ai-index.e2e-spec.ts` — F-01 索引/status
- `test/e2e/files-ai-rag.e2e-spec.ts` — F-02 rag-ask

**Mock：**
```typescript
jest.mock('ai', () => ({ streamText: jest.fn(...) }));
jest.mock('@/files/ai/embedding/embedding.provider', () => ({
  embedMany: jest.fn().mockResolvedValue([[0.1, 0.2], ...]),
  embedOne: jest.fn().mockResolvedValue([0.1, 0.2]),
}));
```

**用例：**
- 无 Token → 401
- 文件不存在 → 404
- 未索引 → 409 或 400「请先建立索引」
- 索引后 rag-ask → 200 text/plain 含 mock 文本
- POST index 重复 → 行为符合设计（409 或 reindex）

Run: `pnpm test:e2e -- test/e2e/files-ai-index.e2e-spec.ts test/e2e/files-ai-rag.e2e-spec.ts`

---

## Task 1.7 前端最小 UI

**Modify:**
- `file_management_frontend/src/api/ai.ts` — index / status / streamRagAsk
- 文件预览或详情页：索引按钮 + 状态 + RAG 输入框（可先不做样式美化）

**验收：** 前后端联调一条完整路径

---

## S12 验收清单

- [x] `pnpm build`
- [x] `pnpm test:e2e` 全绿（含 `files-ai-index`、`files-ai-rag` spec）
- [x] txt 上传 → index → rag-ask 手测通过
- [x] 划词 `ai/ask` 仍正常
- [x] Worker 单独进程 `pnpm start:worker:dev` 可处理 index job
- [x] MIGRATION.md 追加 S12 API 对照

**已知差异（MVP）：**

- `ready` 且 `indexedFileHash` 未变时再次 `POST index` 返回 409「文档未更新」；内容变更后允许重建。
- 前端入口在文本预览弹窗（划词 / 全文切换），非独立「文件详情 Tab」。

---

## Day 1～7 建议排期

| Day | 日期 | 内容 |
|-----|------|------|
| 1 | 07-09 | 阶段 0 + Task 1.1～1.2 |
| 2 | 07-10 | Task 1.3 Embedding |
| 3 | 07-11 | Task 1.4 Processor |
| 4 | 07-12 | Task 1.5 RAG API |
| 5 | 07-13 | Task 1.6 E2E |
| 6 | 07-14 | Task 1.7 前端 + 联调 |
| 7 | 07-15 | 缓冲、修 bug、写 S13 设计 |

---

## 完成后

进入 [S13 实施清单](./2026-07-09-s13-ai-summary-implementation.md) — 6 体裁结构化摘要；可选 F-04 主题 + F-05 PDF。
