# 性能压测笔记

> **项目**：FileManagement 后端  
> **压测日期**：2026-06-17  
> **脚本**：`file_management_backend/scripts/load/login.k6.js`

---

## 1. 环境与前置条件

| 项 | 配置 |
|----|------|
| API | 本机 `pnpm dev`（`api` + `preview` worker） |
| 地址 | `http://localhost:3000` |
| 数据库 | MySQL 8，本机 `localhost:3306` |
| Redis | Docker `file_mgmt_redis_dev`，`6379` |
| 压测工具 | k6 v2.0.0 |
| 测试账号 | `admin`（压测前关闭 TOTP 2FA，避免只停在 `MFA_REQUIRED`） |

**压测前临时调整（勿提交 `.env` 明文密码）**：

- `LOGIN_RATE_LIMIT_MAX=100000`
- `API_RATE_LIMIT_MAX=100000`
- 修改 `.env` 后须 **重启** `pnpm dev`，否则进程仍用旧限流配置
- 若此前已触发限流，需清理 Redis key：`KEYS rl:*`（如 `rl:login*`、`rl:api*`）

**运行命令**（密码通过环境变量传入，勿写入脚本仓库）：

```bash
cd file_management_backend
k6 run -e USERNAME=admin -e PASSWORD=<你的密码> scripts/load/login.k6.js
```

---

## 2. 压测场景

| 项 | 值 |
|----|-----|
| 接口 | `POST /api/auth/login` |
| 并发模型 | k6 `stages`：10s→10 VU，30s→50 VU，10s→0 |
| 最大 VU | 50 |
| 有效负载时长 | 约 50s |
| 每迭代间隔 | `sleep(1)`（约 1 次登录/秒/VU） |

登录成功路径包含：`findUnique(user)` → `getSystemSettings()` → `runLoginSessionTransaction`（Serializable 事务：写 `refresh_tokens`、`login_logs`）。

---

## 3. 结果摘要

| 指标 | 数值 |
|------|------|
| 总请求 | 1196 |
| 成功（HTTP 200 + `success: true`） | 1159（**96.9%**） |
| 失败 | 37（**3.09%**） |
| **p95 延迟** | **18.65 ms** |
| p90 | 16.76 ms |
| 平均延迟 | 15.19 ms |
| 最大延迟 | 159.13 ms |
| 吞吐（含 sleep） | 约 **23.5 req/s** |
| k6 阈值 | `p(95)<3000ms` ✓，`http_req_failed<10%` ✓ |

**结论（登录接口）**：在本机 dev 环境、50 并发下，登录 **p95 约 19ms**，整体很快；约 **3%** 失败更可能来自 **DB 事务锁/瞬时竞争**，而非 CPU 或磁盘 IO 瓶颈。

---

## 4. 瓶颈分析

### 4.1 已排除 / 非主因

| 方向 | 说明 |
|------|------|
| **磁盘 IO** | 登录不写大文件；延迟 ms 级，不像磁盘 bound |
| **JWT 签发** | 相对 DB 事务可忽略 |
| **网络** | 本机 loopback，可忽略 |

### 4.2 可能主因

| 方向 | 说明 |
|------|------|
| **MySQL 事务** | 登录使用 `Prisma.TransactionIsolationLevel.Serializable`，高并发写 `refresh_tokens` + `login_logs` 可能出现锁等待，对应偶发失败与 max 159ms 尖峰 |
| **连接池** | 本次 p95 很低，未观察到明显「等连接」；若生产并发再高，可监控 `Threads_connected` 与 Prisma `connection_limit` |
| **限流（压测踩坑）** | 默认 `LOGIN_RATE_LIMIT_MAX=10` 时，同一 IP 约 10 次后全 429；**不是性能上限**，是安全策略。压测必须临时放宽并清 Redis `rl:*` |

### 4.3 与磁盘/转码队列的关系

- **LibreOffice 预览队列（BullMQ）**：本次未压 `/preview`，不属于登录瓶颈。
- **上传/下载**：未纳入本轮；大文件场景瓶颈通常在磁盘或对象存储带宽，需单独脚本。

---

## 5. 优化建议（按优先级）

### 5.1 登录（可选，非必须）

- 评估登录事务是否必须使用 **Serializable**；若业务允许，可降为 `ReadCommitted` 或缩小事务范围，减轻高并发锁竞争。
- 压测产生的 `login_logs` 量大，生产可考虑异步写日志（非功能必需）。

### 5.2 messages 表索引（文档建议项）

聊天记录查询（`message.controller.ts` → `getChatHistory`）：

```sql
WHERE (sender_id = ? AND receiver_id = ?)
   OR (sender_id = ? AND receiver_id = ?)
ORDER BY created_at ASC
```

**当前 schema 已有**：

- `@@index([receiverId, isRead, createdAt])` — 未读汇总等
- `@@index([senderId, createdAt])`

**建议**：对会话列表做 `EXPLAIN`，若 `OR` 导致索引合并不佳，可考虑：

- 拆成两条 `UNION` 查询；或
- 评估联合索引 `(sender_id, receiver_id, created_at)` 是否覆盖热路径（需结合真实数据量验证，非本次压测实测项）。

### 5.3 后续可补充的压测

- `GET /api/files` 文件列表（只读 + JWT）
- 上传/下载（磁盘或 StorageProvider bound）
- 预览任务堆积时 worker 队列深度（Redis + BullMQ metrics）

---

## 6. 复现清单

1. `docker compose -f docker-compose.dev.yml up -d redis`
2. `.env` 临时放宽 `LOGIN_RATE_LIMIT_*` / `API_RATE_LIMIT_*`，重启 `pnpm dev`
3. `docker exec file_mgmt_redis_dev redis-cli KEYS "rl:*"` 确认为空或已清理
4. `k6 run -e USERNAME=... -e PASSWORD=... scripts/load/login.k6.js`
5. 记录本文第 3 节表格中的 p95、失败率、QPS

---

## 7. 面试一句话

> 使用 k6 对 `POST /api/auth/login` 在 50 VU 下压测，p95 约 19ms、成功率约 97%；瓶颈不在接口本身延迟，高并发下需关注 Serializable 事务与限流配置；messages 会话查询建议结合 EXPLAIN 验证 OR 条件上的索引利用。
