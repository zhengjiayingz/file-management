# S11 收尾与 Express 下线 — 设计文档

> 日期：2026-07-08  
> 状态：已评审  
> 前置：**S1～S10 已完成**，S10 手测通过

## 目标

结束双栈期：**Nest 成为唯一运行后端**（端口 **3000**），Express `file_management_backend` 停服归档。

## 范围

| 任务 | 说明 | 非目标 |
|------|------|--------|
| Swagger | `@nestjs/swagger`，路径 `/api-docs` | 逐端点完整 DTO 注解（可后续补） |
| 定时清理 | `@nestjs/schedule` 迁 `cleanup.job.ts` | 新清理策略 |
| Preview Worker | `@nestjs/bullmq` Processor，队列 `preview-convert` 不变 | 重写转码算法 |
| 端口 | Nest 默认 **3000**；Express 不再监听 | 删 Express 源码（保留只读归档） |
| docker-compose | Nest Dockerfile + compose 替换 api/worker | K8s 部署 |
| Prisma | **Nest `prisma/schema.prisma` 为唯一维护点** | 删 Express schema 文件 |
| 文档 | `MIGRATION.md` 完成态 | 前端大改 |

## 架构

```
src/
  jobs/
    cleanup-tasks.service.ts     # @Cron 每小时：pending_delete 文件 + 过期分享
  files/preview/
    preview.processor.ts           # @Processor('preview-convert') 消费 convert 任务
    files-preview.service.ts       # + processPreviewConvertJob / shouldDeferFullConversion
  worker.main.ts                   # 可选独立进程（docker worker 服务）

main.ts                            # Swagger /api-docs、默认 PORT=3000
```

- **API 进程**：HTTP + Socket + Schedule +（可选）同进程 Processor  
- **Worker 进程**（docker `worker` 服务）：`node dist/worker.main.js`，仅 BullMQ Processor + Prisma  
- **队列契约**：`PREVIEW_QUEUE_NAME=preview-convert`、`PREVIEW_JOB_NAME=convert` 与 Express 完全一致

## Express 下线策略

1. `file_management_backend/README.md` 顶部标记 **DEPRECATED**，指向 Nest  
2. 不再更新 Express 启动脚本 / docker 默认 command  
3. 前端默认 API 仍为 `http://localhost:3000`（Nest 接管该端口）  
4. 开发：只启动 `file_management_backend_nest` + 前端

## 验收

1. `pnpm build` + `pnpm test:e2e` 全绿  
2. `GET /api-docs` 可访问  
3. Office 预览入队后 Nest Worker 消费（无 Express worker）  
4. 每小时 cleanup cron 注册成功（启动日志）  
5. Nest `PORT=3000` 手测全功能  
6. `MIGRATION.md` 标记迁移完成

## Express 参照

- `../file_management_backend/src/jobs/cleanup.job.ts`
- `../file_management_backend/src/workers/preview.worker.ts`
- `../file_management_backend/src/config/swagger.config.ts`
- `../file_management_backend/docker-compose.yml`
