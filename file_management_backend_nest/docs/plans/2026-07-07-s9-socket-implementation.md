# S9 Socket Gateway Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 迁入 Socket.IO Gateway，补齐 `message:new` 与 `friendship:sync` 推送，行为对齐 Express。

**Architecture:** `RealtimeModule` + `ContactsGateway` + `RealtimeEmitterService`；Message/Friendship 注入 Emitter；Redis Adapter 可选。

**Tech Stack:** NestJS 11、`@nestjs/websockets`、`socket.io`、`@socket.io/redis-adapter`、`socket.io-client`（e2e）

**设计文档：** [2026-07-07-s9-socket-design.md](./2026-07-07-s9-socket-design.md)

**Express 参照：** `../file_management_backend/src/realtime/socket.ts`

---

## Task 1: 依赖

**Files:** Modify `package.json`, `pnpm-lock.yaml`

```bash
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io @socket.io/redis-adapter
pnpm add -D socket.io-client
```

---

## Task 2: 失败 e2e（TDD RED）

**Files:**
- Create: `test/helpers/realtime.helper.ts`
- Create: `test/e2e/socket.e2e-spec.ts`

**Step 1:** `listenE2eApp(app)` — `await app.listen(0)` 返回 port  
**Step 2:** 用例：无 token → `connect_error`；合法 token → `connect`；REST 发消息 → 接收方 `message:new`；发好友请求 → 对方 `friendship:sync`

**Step 2 运行：** `pnpm test:e2e test/e2e/socket.e2e-spec.ts` → 预期 FAIL（Gateway 未实现）

---

## Task 3: Realtime 模块（TDD GREEN）

**Files:**
- Create: `src/realtime/socket-auth.util.ts`
- Create: `src/realtime/realtime-emitter.service.ts`
- Create: `src/realtime/contacts.gateway.ts`
- Create: `src/realtime/realtime.module.ts`
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`（`IoAdapter`）

**验证：** `pnpm test:e2e test/e2e/socket.e2e-spec.ts` → PASS

---

## Task 4: 接入 Message / Friendship

**Files:**
- Modify: `src/message/message.module.ts`, `message.service.ts`
- Modify: `src/friendship/friendship.module.ts`, `friendship.service.ts`

**验证：** socket e2e + `pnpm test:e2e test/e2e/message.e2e-spec.ts test/e2e/friendship.e2e-spec.ts`

---

## Task 5: 文档

- Modify: `MIGRATION.md`（S9 ✅、手测清单）
- Modify: `docs/plans/2026-07-06-nest-migration-design.md`

---

## Task 6: 全量验证

```bash
pnpm build
pnpm test:e2e
```

Expected: 17 suites / 98 tests，0 failures ✅
