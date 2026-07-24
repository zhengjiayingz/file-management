# Express → Nest 迁移路线图

> **状态：迁移完成（S11）** — Nest 为唯一运行后端，默认端口 **3000**。Express 已归档。

与 `../file_management_backend` 共用 Prisma / MySQL（schema 权威：`prisma/schema.prisma`）。

## 阶段进度

| 阶段 | 模块 | 状态 |
|------|------|------|
| P0 | 骨架、Config、Prisma、Health、全局校验 | ✅ |
| P1 | 横切：Redis、限流、Guards、异常 Filter | ✅ |
| **S1** | **Auth 15 端点全量** | **✅** |
| P1 | User：GET /user/profile | ✅ |
| S2 | Files 读（最小集） | ✅ |
| S3 | AI 流式问答 | ✅ |
| S4 | 预览 + BullMQ | ✅ |
| S5 | User + UserPreference | ✅ |
| **S6** | **Files 上传** | **✅** |
| **S7** | **Tags + Versions + Archive** | **✅** |
| **S8** | **Friendship + Message + Share** | **✅** |
| **S9** | **Socket Gateway（实时推送）** | **✅** |
| **S10** | **Admin + VIP + Log** | **✅** |
| **S11** | **Swagger + 定时清理 + Preview Worker + Express 下线** | **✅** |
| **S12** | **AI 文档索引 + RAG 全文问答（F-01 / F-02）** | **✅** |
| **S13** | **分层摘要 + 体裁化输出 + 前端摘要 Tab（F-03）** | **✅** |
| **S14a** | **PDF 文本索引 + PDF 预览 AI 面板（F-05）** | **✅** |
| **S14** | **学术知识卡片（F-06）** | **✅** |

## 启动

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm start:dev          # API http://localhost:3000
pnpm start:worker:dev   # 预览 + 文档索引 Worker（需 REDIS_URL；预览另需 LibreOffice）
```

Swagger：`http://localhost:3000/api-docs`

Docker：`docker compose up -d`（见 `docker-compose.yml`）

## API 对照（Auth 全量）

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/auth/register` | 同 | ✅ |
| `GET /api/auth/password-policy` | 同 | ✅ |
| `POST /api/auth/login` | 同 | ✅ |
| `POST /api/auth/mfa/verify` | 同 | ✅ |
| `POST /api/auth/forgot-password` | 同 | ✅ |
| `POST /api/auth/refresh` | 同 | ✅ |
| `POST /api/auth/logout` | 同 | ✅ |
| `POST /api/auth/change-password` | 同 | ✅ |
| `POST /api/auth/mfa/setup/start` | 同 | ✅ |
| `POST /api/auth/mfa/setup/confirm` | 同 | ✅ |
| `POST /api/auth/mfa/setup/cancel` | 同 | ✅ |
| `POST /api/auth/mfa/disable` | 同 | ✅ |
| `GET /api/auth/me` | 同 | ✅ |
| `POST /api/auth/sessions/list` | 同 | ✅ |
| `POST /api/auth/sessions/revoke` | 同 | ✅ |
| `GET /api/user/profile` | 同 | ✅ |
| `GET /health` | 同（无 `/api` 前缀） | ✅ |

## S1 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3000
```

验证：注册、登录、MFA、会话管理、改密、忘记密码。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S2 Files 读最小集）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/files` | 同 | ✅ |
| `GET /api/files/:id` | 同 | ✅ |
| `GET /api/files/:id/download` | 同 | ✅ |
| `GET /api/files/:id/thumbnail` | 同 | ✅ |
| `GET /api/files/:id/text-chunk` | 同 | ✅ |
| `DELETE /api/files/:id` | 同 | ✅ |
| `POST /api/files/:id/restore` | 同 | ✅ |
| `DELETE /api/files/:id/permanent` | 同 | ✅ |
| `POST /api/files/batch/delete` | 同 | ✅ |
| `POST /api/files/batch/restore` | 同 | ✅ |
| `POST /api/files/batch/move` | 同 | ✅ |
| `POST /api/files/batch/permanent-delete` | 同 | ✅ |
| `POST /api/files/batch/download-zip` | 同 | ✅ |
| `PUT /api/files/:id/rename` | 同 | ✅ |
| `PUT /api/files/:id/move` | 同 | ✅ |

## S2 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3000
```

验证：文件列表、下载、txt 预览、回收站（删除/恢复/永久删除）、重命名、移动、批量操作。

**注意**：上传（S6）、Office 预览（S4）仍在 Express，手测时相关功能会 404。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S3 AI 流式问答）

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/files/:id/ai/ask` | 同 | ✅ |

流式响应为 `text/plain`（非 JSON 包装），与 Express 一致。需配置 `AI_API_KEY`（及可选 `AI_BASE_URL`、`AI_MODEL`）。

## API 对照（S12 AI 文档索引 + RAG）

**实施文档**：`docs/plans/2026-07-09-s12-ai-index-rag-implementation.md`

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/files/:id/ai/index` | 同（S13 扩展 body，见下） | ✅ |
| `GET /api/files/:id/ai/index/status` | 同（含 `summarizing`、`summaryGenre`） | ✅ |
| `POST /api/files/:id/ai/rag-ask` | 同 | ✅ |

- 索引：异步 BullMQ 队列 `document-index`（`pnpm start:worker:dev` 消费）；支持 `.txt` / `.md` / **文字层 `.pdf`**（S14a）。
- RAG：需 `status=ready`；`embed(question)` → Top-K chunk → `streamText` 流式 `text/plain`。
- **Embedding 与对话可分离配置**：`AI_EMBEDDING_BASE_URL`、`AI_EMBEDDING_API_KEY`、`AI_EMBEDDING_MODEL`（DeepSeek 无 `/embeddings`，需硅基流动等兼容服务）；对话仍用 `AI_BASE_URL` / `AI_MODEL`。
- Prisma：`DocumentIndexJob`、`DocumentChunk`（embedding 存 JSON）。

## API 对照（S13 分层摘要）

**实施文档**：`docs/plans/2026-07-09-s13-ai-summary-implementation.md`

| 端点 | 说明 | 状态 |
|------|------|------|
| `POST /api/files/:id/ai/index` | Body：`{ summaryGenre, force? }`；`summaryGenre` 必填（6 体裁）；`force: true` 可强制 reindex（补旧 S12 索引摘要） | ✅ |
| `GET /api/files/:id/ai/index/status` | 含 `summarizing` 阶段、`progressMsg`、`summaryGenre` | ✅ |
| `GET /api/files/:id/ai/summary` | Query：`type=book\|chapter`（默认 book）、`chapterNo?`；索引 `ready` 后读库，不调 LLM | ✅ |

**体裁 `summaryGenre`（6 项）**：`novel` | `general_nonfiction` | `technical` | `textbook` | `lab_report` | `paper`

**索引流程（Worker）**：extracting → chunking → embedding → **summarizing（Map-Reduce）** → ready

**Prisma 新增**：`DocumentSummary`（`type` + `refKey` + `payload` Json）；`DocumentIndexJob.summaryGenre`

**实现要点**：

- `src/files/ai/summary/` — Map-Reduce、Zod schema、体裁 Prompt
- `src/files/ai/utils/structured-object.util.ts` — DeepSeek 等网关不支持 `json_schema` 时降级 `json_object`，Prompt 注入 Schema + 重试
- 前端 `TextChunkPreviewDialog`：体裁下拉 +「问答 / 摘要」Tab + `SummaryPanel`；ready 时显示「重新建立索引」
- 前端 `PdfDocumentPreviewDialog`（S14a）：同上 AI 面板 + `PdfJsViewer` 划词

**不变**：`POST .../ai/ask`（划词）、`POST .../ai/rag-ask`（全文问答）

## API 对照（S14 学术知识卡片）

| 端点 | 说明 | 状态 |
|------|------|------|
| `POST /api/files/:id/ai/index` | `summaryGenre=paper` 时 Worker 多跑 `extracting_knowledge` | ✅ |
| `GET /api/files/:id/ai/index/status` | 含 `extracting_knowledge` 阶段 | ✅ |
| `GET /api/files/:id/ai/knowledge` | 学术索引 `ready` 后读 `DocumentKnowledge.payload`；非 academic → 409 | ✅ |

**索引流程（Worker，paper）**：extracting → chunking → embedding → summarizing → **extracting_knowledge** → ready

**Prisma**：`DocumentKnowledge`（`userFileId` 唯一 + `payload` Json）

**实现要点**：

- `src/files/ai/knowledge/` — Zod schema、分字段 RAG 抽取、Prompt  
- `KnowledgeExtractService` — 六组字段 `embedOne` + Top-K + `generateStructuredObject` → `mergePaperKnowledge`  
- 前端 `KnowledgePanel` + `DocumentAiPanel` 知识点 Tab（**仅 `paper` 显示**；`lab_report` 抽取延后）  
- 环境变量可选：`AI_PAPER_KNOWLEDGE_TOP_K`（默认 12）

## S14a 验收（F-05 PDF 文本索引）

验证（需 **Worker 运行** + DeepSeek + Embedding 配置正确）：

1. 上传文字层 PDF → 预览 → 选体裁 →「建立索引」
2. 状态经 `extracting` → `chunking` → `embedding` → `summarizing` → `ready`
3.「摘要」Tab 展示结构化字段；「全文问答」RAG 流式输出
4. PDF 划词后右侧「划词问答」可用
5. 扫描件/无文字层 PDF：Worker 标记 `failed`，`errorMessage` 含扫描件提示

```bash
pnpm test:e2e -- files-ai-index.e2e-spec.ts   # 含 PDF pending / MIME 校验
pnpm test:e2e -- files-ai-rag.e2e-spec.ts     # 含 PDF rag-ask
pnpm test:e2e -- files-ai-summary.e2e-spec.ts # 含 PDF summary
pnpm test -- document-index.processor.spec.ts # 扫描件 failed
pnpm test -- text-extractor.spec.ts           # PDF 提取 / ScannedPdfError
```

**实现要点**：

- `src/files/ai/chunk/text-extractor.ts` — `pdf-parse` 提取；`ScannedPdfError`
- `src/files/ai/document-index.processor.spec.ts` — Worker 扫描件失败路径
- 前端 `src/composables/usePdfTextSelection.ts` — 基于 pdf.js `getTextContent` 原始坐标划词

## S14 验收（F-06 学术知识卡片）

验证（需 **Worker 运行** + DeepSeek + Embedding 配置正确）：

1. 上传文字层论文 PDF / MD → 体裁选 **期刊论文（paper）** →「建立索引」
2. 状态经 `summarizing` → `extracting_knowledge` → `ready`
3.「知识点」Tab 展示 title / contributions / methodology / keyFindings 等；`dataset` 可为空
4. `GET /api/files/:id/ai/knowledge` 读库一致
5. 体裁切到「实验报告」：知识点 Tab 隐藏并切回「问答」（MVP 不抽 lab_report）

```bash
pnpm test -- knowledge-extract.service.spec.ts
pnpm test -- document-index.processor.spec.ts
pnpm test -- knowledge.schemas.spec.ts
pnpm test:e2e -- files-ai-knowledge.e2e-spec.ts
```

**实现要点**：

- `src/files/ai/knowledge/knowledge-extract.service.ts` — 分字段 RAG 抽取  
- `src/files/ai/files-ai-knowledge.service.ts` — 读 API  
- 前端 `KnowledgePanel`、`DocumentAiPanel.showKnowledgeTab`（仅 paper）

## API 对照（S16b 语义搜索 / F-08）

**实施文档**：`docs/plans/2026-07-17-F08-语义搜索-实现方案.md`

| 端点 | 说明 | 状态 |
|------|------|------|
| `GET /api/files/search` | Query：`q`（必填）、`limit?`（默认 20，最大 50）；鉴权 JWT | ✅ |

- 仅检索当前用户 `DocumentIndexJob.status=ready` 的文件；按 chunk cosine 聚合为文件级 `max(score)`，`MIN_SCORE=0.35`。
- 响应：`{ success, data: { items, indexedFileCount, q } }`；`items` 含 `score` / `excerpt` / `chunkIndex` 与文件元数据。
- 前端：文件页顶栏「智能搜索」→ `SemanticSearchDialog`；与 `GET /files?q=` 文件名筛选解耦。
- 单测：`files-search.service.spec.ts`。
- **运维**：需 Worker 建索引后才有语义结果；Embedding 配置同 S12。

## API 对照（S16c 划词翻译 / F-11）

**实施文档**：`docs/plans/2026-07-16-F11-划词翻译-实现方案.md`

| 端点 | 说明 | 状态 |
|------|------|------|
| `POST /api/files/:id/ai/translate` | Body：`{ text, targetLang: 'default'\|'zh'\|'en'\|'ja', fileName? }`；流式 `text/plain` | ✅ |

- `targetLang=default`：汉字占比判定 → 主要中文译英，否则译中；显式 zh/en/ja 以下拉为准。
- 前端：`DocumentAiPanel` Header 翻译入口，**仅划词问答模式**显示；译文写入同一套 `chatMessages`。
- 单测：`detect-chinese.util.spec.ts`、`files-ai-translate.service.spec.ts`。
- **运维**：新增路由后若仍 `Cannot POST`，多为旧 `dist`；`pnpm build` 后重启，或用 `pnpm start:dev`。

## S12 验收

验证：`TextChunkPreviewDialog` 建立索引 → 状态轮询至 ready →「全文问答」流式输出；划词 `ai/ask` 仍正常。

## S13 验收

验证（需 **Worker 运行** + DeepSeek + Embedding 配置正确）：

1. 文本预览 → 选体裁（如「小说」）→「建立索引」或「重新建立索引」
2. 状态经 `summarizing` 至 `ready`
3.「摘要」Tab 展示结构化字段（oneLiner、overview、plotPoints 等）
4. 再次 `GET .../ai/summary` 读库一致，不重复调 LLM
5.「全文问答」RAG 仍可用

```bash
# .env 示例（对话 + Embedding 分离）
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=...
AI_EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
AI_EMBEDDING_API_KEY=...
AI_EMBEDDING_MODEL=BAAI/bge-m3
# 可选：非 DeepSeek 网关若也不支持 json_schema，设为 json_object
# AI_STRUCTURED_JSON_MODE=json_object
```

**单测**：`src/files/ai/summary/*.spec.ts`（schema + Map-Reduce mock）。**E2E**：`files-ai-summary.e2e-spec.ts` 待补；`files-ai-index.e2e` 仍用旧 `{ mode }` body，需后续对齐 `summaryGenre`。

## S3 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3000
```

验证：`TextChunkPreviewDialog` 划词问答、流式输出、点击停止可中断。

**注意**：上传（S6）仍在 Express。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S4 Office 预览 + BullMQ）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/files/:id/preview` | 同 | ✅ |
| `GET /api/files/:id/preview-state` | 同 | ✅ |
| `GET /api/files/:id/preview-status` | 同 | ✅ |

BullMQ 队列名 `preview-convert` 不变；预览缓存默认目录 `../file_management_backend/previews`。Worker：`pnpm start:worker:dev`（Nest `@nestjs/bullmq` Processor）。

## S4 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3000
```

验证：双击 Word/PPT 打开 `OfficePreviewDialog`、PDF 预览、状态栏轮询 partial→full。

**注意**：上传（S6）仍在 Express。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S5 User + UserPreference）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/user/profile` | 同 | ✅ |
| `PUT /api/user/profile` | 同 | ✅ |
| `POST /api/user/avatar` | 同 | ✅ |
| `GET /api/user/search` | 同 | ✅ |
| `GET /api/user-preferences` | 同 | ✅ |
| `PUT /api/user-preferences` | 同 | ✅ |

头像存储至 `../file_management_backend/uploads/avatars`，与 Express 共用；静态路径 `/uploads/avatars/*` 由 `main.ts` 提供。

## S5 验收

验证：设置页更新邮箱、上传头像、主题/语言切换、好友搜索用户。

## API 对照（S6 Files 上传）

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/files/check-exists` | 同 | ✅ |
| `POST /api/files/check-name` | 同 | ✅ |
| `POST /api/files/upload-chunk` | 同 | ✅ |
| `GET /api/files/chunks/:fileHash` | 同 | ✅ |
| `POST /api/files/merge-chunks` | 同 | ✅ |
| `POST /api/files/instant-upload` | 同 | ✅ |
| `POST /api/files/upload` | 同 | ✅ |
| `POST /api/files/folder` | 同 | ✅ |

分片临时目录 `chunks/<fileHash>/` 与 Express 共用；最终文件写入 `UPLOAD_PATH`（默认 `../file_management_backend/uploads`）。

**注意**：`check-name` 响应为 `{ success, exists }`（无 `data` 包装），与 Express 一致。

## S6 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3000
```

验证：拖拽/选择上传、大文件分片、秒传、新建文件夹。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S7 Tags + Versions + Archive）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/files/tags` | 同 | ✅ |
| `POST /api/files/tags` | 同 | ✅ |
| `PUT /api/files/tags/:tagId` | 同 | ✅ |
| `DELETE /api/files/tags/:tagId` | 同 | ✅ |
| `PUT /api/files/:id/tags` | 同 | ✅ |
| `GET /api/files/:id/versions` | 同 | ✅ |
| `POST /api/files/:id/versions/:versionId/rollback` | 同 | ✅ |
| `GET /api/files/:id/versions/:versionId/download` | 同 | ✅ |
| `GET /api/files/:id/archive/entries` | 同 | ✅ |
| `POST /api/files/:id/archive/conflicts` | 同 | ✅ |
| `POST /api/files/:id/archive/extract` | 同 | ✅ |

在线解压需 **VIP 或管理员**；解压落盘复用 `MergeUploadService.registerLocalFileInDrive`。

## S7 验收

验证：标签 CRUD、文件版本列表/回滚/下载、ZIP 在线解压（VIP/管理员）。

## 测试

```bash
pnpm test:e2e    # Auth + Health + Files + User + UserPreference e2e
```

S2 e2e 覆盖：列表、详情、下载、text-chunk、回收站、重命名、移动、批量删除/恢复。
S3 e2e 覆盖：AI 401/400/404、text/plain 流式 mock 响应。
S12 e2e 覆盖：`files-ai-index`（index/status 401/404/400、pending/ready/reindex、**PDF pending/MIME**）、`files-ai-rag`（rag-ask 401/404/409/400、流式 mock、**PDF rag-ask**）；mock embedding + BullMQ 入队。
S13 单测：`summary.schemas.spec.ts`、`summary-map-reduce.service.spec.ts`。S13 e2e：`files-ai-summary`（401/404/409、GET book、读库幂等、**PDF summary**）；`files-ai-index` 已对齐 `summaryGenre` + `force`。
S14a 单测：`text-extractor.spec.ts`（PDF 提取/扫描件）、`document-index.processor.spec.ts`（Worker 扫描件 failed）。
S14 单测：`knowledge.schemas.spec.ts`、`knowledge-extract.service.spec.ts`、`document-index.processor.spec.ts`（paper 调抽取）。S14 e2e：`files-ai-knowledge`（401/404/409、paper payload）。
S4 e2e 覆盖：预览 401/404/400、preview-state/status JSON、有缓存时 PDF 流。
S5 e2e 覆盖：profile GET/PUT、avatar 上传、user search、user-preferences GET/PUT。
S6 e2e 覆盖：check-exists、check-name、分片上传+合并、instant-upload 404、传统 upload、folder 创建与重名。
S7 e2e 覆盖：tags CRUD、versions 列表/回滚/下载、archive 403/entries/conflicts/extract。
S8 e2e 覆盖：friendship 请求/接受/列表/删除、message 发送/历史/已读/未读汇总、share 创建/公开访问/我的分享/访问日志、**save-to-my-drive 转存（好友/分享链接/聊天 fileId）**。
S9 e2e 覆盖：Socket 无 token/无效 token 拒绝、有效 token 连接、`message:new` 推送、`friendship:sync` 推送。
S10 e2e 覆盖：Admin 403/仪表盘/用户列表/禁用用户/系统设置；VIP 申请/重复申请/审核通过；Log 分页与 `transferOnly` 上传记录。
S6–S8 手测缺陷回归见 `docs/plans/2026-07-07-regression-tests-supplement.md`（OGG Range/MIME、转存 404 等）。

## API 对照（S8 Friendship + Message + Share）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/friendships` | 同 | ✅ |
| `GET /api/friendships/requests/pending` | 同 | ✅ |
| `POST /api/friendships/request` | 同 | ✅ |
| `PUT /api/friendships/request/:requestId/accept` | 同 | ✅ |
| `PUT /api/friendships/request/:requestId/reject` | 同 | ✅ |
| `DELETE /api/friendships/:friendId` | 同 | ✅ |
| `GET /api/messages/unread-summary` | 同 | ✅ |
| `POST /api/messages` | 同 | ✅ |
| `GET /api/messages/:friendId` | 同 | ✅ |
| `PUT /api/messages/:friendId/read` | 同 | ✅ |
| `POST /api/shares` | 同 | ✅ |
| `GET /api/shares/mine` | 同 | ✅ |
| `GET /api/shares/:shareId/access-logs` | 同 | ✅ |
| `GET /api/shares/public/:shareCode` | 同（公开） | ✅ |
| `POST /api/shares/public/:shareCode/access` | 同（公开） | ✅ |
| `GET /api/shares/public/:shareCode/file/:userFileId/download` | 同（公开） | ✅ |
| `POST /api/files/:id/save-to-my-drive` | 同（好友/链接分享转存） | ✅ |

`ShareService.verifySharedFileForSave` 供转存校验复用。Socket 推送见 **S9**。

## S9 — Socket Gateway

**实施文档**：`docs/plans/2026-07-07-s9-socket-design.md`、`docs/plans/2026-07-07-s9-socket-implementation.md`

| 能力 | Express | Nest | 状态 |
|------|---------|------|------|
| 路径 `/socket.io` | `src/realtime/socket.ts` | `src/realtime/contacts.gateway.ts` | ✅ |
| 握手 JWT + sessionVersion | 同 | `socket-auth.util.ts` | ✅ |
| 房间 `user:{id}` | 同 | 连接后自动 join | ✅ |
| 事件 `message:new` | Message 创建后推送接收方 | `MessageService` → `RealtimeEmitterService` | ✅ |
| 事件 `friendship:sync` | 好友请求/接受/拒绝/删除 | `FriendshipService` → `RealtimeEmitterService` | ✅ |
| Redis Adapter（多实例） | 有 `REDIS_URL` 时启用 | `ContactsGateway.afterInit` | ✅ |

**手测清单**（双浏览器 / 双账号）：

1. 账号 A、B 互加好友后，A 发消息，B 聊天页**无需刷新**即出现新消息（`message:new`）。
2. A 向 B 发好友请求，B 好友页**实时**出现待处理请求（`friendship:sync`）。
3. 前端 `VITE_API_BASE_URL` 指向 Nest `3000`，确认 `contactsSocket.ts` 能连上。

VIP/Admin 相关 Socket 推送见 **S10**（VIP 申请 `message:new`）。

## S10 — Admin + VIP + Log

**实施文档**：`docs/plans/2026-07-07-s10-admin-vip-log-design.md`、`docs/plans/2026-07-07-s10-admin-vip-log-implementation.md`

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/admin/dashboard` 等 9 端点 | `src/admin/` + `@Roles('admin')` | ✅ |
| `GET /api/vip/tier-config` 等 8 端点 | `src/vip/` | ✅ |
| `GET /api/logs` | `src/operation-log/operation-log.controller.ts` | ✅ |
| VIP 申请通知 admin（`message:new`） | `VipService.notifyAdminsVipApply` | ✅ |

**手测清单**：

1. 管理员登录 → 仪表盘数据正常、用户列表、禁用/重置密码。
2. 普通用户提交 VIP 申请 → 管理员通讯录实时收到通知。
3. 管理员审核通过 → 用户角色变 VIP、配额更新。
4. 传输记录页（`transferOnly=true`）显示上传/下载日志。

## S11 — 收尾与 Express 下线

**实施文档**：`docs/plans/2026-07-08-s11-shutdown-design.md`

| 任务 | Nest | 状态 |
|------|------|------|
| Swagger `/api-docs` | `@nestjs/swagger` | ✅ |
| 定时清理 | `JobsModule` + `@Cron('0 * * * *')` | ✅ |
| Preview Worker | `PreviewProcessor` + `pnpm start:worker` | ✅ |
| 默认端口 3000 | `main.ts` / `.env.example` | ✅ |
| Docker | `Dockerfile` + `docker-compose.yml` | ✅ |
| GitHub CI | `.github/workflows/backend-ci.yml` → Nest e2e | ✅ |
| Express 归档 | `file_management_backend/README.md` DEPRECATED | ✅ |
| Prisma 权威 | `file_management_backend_nest/prisma/schema.prisma` | ✅ |

**e2e**：23 suites（含 `swagger.e2e-spec.ts`、`files-ai-index.e2e-spec.ts`、`files-ai-rag.e2e-spec.ts`）；`pnpm test:e2e` 结束后自动清理测试数据。

## S8 验收

验证：加好友、发消息、创建分享链接、未登录访问公开分享页。
