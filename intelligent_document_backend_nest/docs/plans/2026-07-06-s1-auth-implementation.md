# S1 Auth 补全 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Auth 模块从 3/15 端点补全至 15/15，对齐 Express API 契约，边迁边重构为 `SessionService` / `MfaService` / `PasswordService` 分层，并通过全量 e2e 验收。

**Architecture:** `AuthController` 保持薄路由层；会话与 Token 逻辑迁入 `SessionService`；TOTP 迁入 `MfaService`；改密/注册迁入 `PasswordService`；`AdminFriendService` 支撑注册与忘记密码的好友关系。Express 代码冻结不动；`forgot-password` 的 Socket 推送在 S9 前以 DB 写入为主（响应与 Express 一致）。

**Tech Stack:** NestJS 11、Prisma 5、@nestjs/jwt、otplib、class-validator、Supertest、Jest e2e

**设计文档：** [2026-07-06-nest-migration-design.md](./2026-07-06-nest-migration-design.md)

**Express 参照：** `../file_management_backend/src/controllers/auth.controller.ts`

---

## 前置条件

```bash
cd file_management_backend_nest
cp .env.example .env          # DATABASE_URL / JWT_SECRET 与 Express 一致
pnpm install
pnpm prisma:generate
pnpm build                    # 确认基线通过
```

Express 与 MySQL 须可连接（e2e 会读写测试用户数据）。

---

## 已知缺口（实施前必读）

| 缺口 | 位置 | 修复任务 |
|------|------|----------|
| MFA 登录返回 `mfaToken: null` | `auth.service.ts:64` | Task 4 |
| 登录缺 `password_policy_hint` | `auth.service.ts` login 返回值 | Task 4 |
| `PasswordPolicyService` 缺 `describePasswordPolicy` / `policyToPublicDTO` | `password-policy.service.ts` | Task 1 |
| 密码强度错误文案与 Express 不完全一致 | 同上 | Task 1 |

---

## Task 0: E2E 脚手架

**Files:**
- Create: `test/helpers/app-bootstrap.ts`
- Create: `test/helpers/auth.helper.ts`
- Modify: `test/app.e2e-spec.ts` → 移至 `test/e2e/health.e2e-spec.ts`
- Modify: `test/jest-e2e.json`

**Step 1: 创建 app-bootstrap**

`test/helpers/app-bootstrap.ts`：

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

export async function createE2eApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}
```

**Step 2: 创建 auth.helper**

`test/helpers/auth.helper.ts`：

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

const TEST_USER = { username: 'e2e_auth_user', password: 'Test@1234' };

export async function ensureTestUser(app: INestApplication<App>) {
  const server = app.getHttpServer();
  const reg = await request(server)
    .post('/api/auth/register')
    .send({ username: TEST_USER.username, password: TEST_USER.password });
  if (reg.status === 201) return TEST_USER;
  // 已存在则直接登录
  return TEST_USER;
}

export async function loginAndGetTokens(app: INestApplication<App>) {
  await ensureTestUser(app);
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send(TEST_USER);
  return {
    accessToken: res.body.data.accessToken as string,
    refreshToken: res.body.data.refreshToken as string,
  };
}
```

> Task 4 完成 register 前，`ensureTestUser` 会失败——Task 0 先只测 health；auth.helper 在 Task 4 后启用。

**Step 3: 迁移 health e2e**

将 `test/app.e2e-spec.ts` 内容改为使用 `createE2eApp()`，或移至 `test/e2e/health.e2e-spec.ts`。

**Step 4: 更新 jest-e2e.json**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

**Step 5: 验证**

```bash
pnpm test:e2e
```

Expected: health e2e PASS

---

## Task 1: 补全 PasswordPolicyService

**Files:**
- Modify: `src/common/password-policy/password-policy.service.ts`
- Test: `src/common/password-policy/password-policy.service.spec.ts`

**Step 1: 写失败单测**

```typescript
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  const svc = new PasswordPolicyService(null as never);

  it('policyToPublicDTO 返回结构化策略', () => {
    const policy = { minLength: 8, requiredCategories: ['digit', 'lower'] as const, minCategoriesInPool: 2 };
    expect(svc.policyToPublicDTO(policy)).toEqual({
      minLength: 8,
      requiredCategories: ['digit', 'lower'],
      minCategoriesInPool: 2,
    });
  });

  it('describePasswordPolicy 生成中文提示', () => {
    const policy = { minLength: 8, requiredCategories: ['digit', 'lower', 'upper'] as const, minCategoriesInPool: 2 };
    expect(svc.describePasswordPolicy(policy)).toContain('至少8位');
  });
});
```

**Step 2: 运行确认失败**

```bash
pnpm test -- password-policy.service.spec.ts
```

**Step 3: 实现**

在 `PasswordPolicyService` 中从 Express `passwordPolicy.service.ts` 移植：

- `CATEGORY_LABEL_ZH` 常量
- `describePasswordPolicy(policy: PasswordPolicy): string`
- `policyToPublicDTO(policy: PasswordPolicy)`
- 将 `validatePasswordStrengthWithPolicy` 错误文案对齐 Express（含「在 X 中至少须满足 N 类」格式）

**Step 4: 验证**

```bash
pnpm test -- password-policy.service.spec.ts
```

Expected: PASS

---

## Task 2: 提取 SessionService

**Files:**
- Create: `src/auth/session.service.ts`
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.module.ts`

**Step 1: 创建 SessionService**

从 `auth.service.ts` 迁出以下 private/public 逻辑：

```typescript
// src/auth/session.service.ts
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  generateAccessToken(userId, username, mustChangePassword, sessionVersion): string { ... }
  generateRefreshToken(): string { ... }
  getMaxSessionSlots(role: Role): number | null { ... }
  runLoginSessionTransaction(req, user, finalMustChange, revokeId): Promise<...> { ... }
  listActiveSessions(userId: number): Promise<SessionDto[]> { ... }
  async refresh(refreshToken: string): Promise<{ accessToken: string }> { ... }
  async logout(refreshToken?: string): Promise<void> { ... }
  async revokeSessions(userId, ids, clientRefresh): Promise<{ revokeSelf: boolean }> { ... }
  async listSessionsForUser(userId, clientRefresh?): Promise<{ sessions; currentSessionId }> { ... }
}
```

**Step 2: 精简 AuthService**

`auth.service.ts` 的 `login` / `refresh` / `logout` 委托给 `SessionService`：

```typescript
async refresh(refreshToken: string) {
  const { accessToken } = await this.sessionService.refresh(refreshToken);
  return { success: true, message: 'Token 刷新成功', data: { accessToken } };
}
```

**Step 3: 注册到 AuthModule**

```typescript
providers: [AuthService, SessionService, PasswordPolicyService],
exports: [AuthService, SessionService, JwtModule],
```

**Step 4: 验证现有功能未破坏**

```bash
pnpm build
pnpm start:dev   # 手测 login / refresh / logout
```

---

## Task 3: AdminFriendService

**Files:**
- Create: `src/common/admin-friend/admin-friend.service.ts`
- Create: `src/common/admin-friend/admin-friend.module.ts`
- Modify: `src/app.module.ts`（import AdminFriendModule）

**Step 1: 从 Express 移植**

参照 `../file_management_backend/src/services/adminFriend.service.ts`：

```typescript
@Injectable()
export class AdminFriendService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrimaryAdminId(): Promise<number | null> { ... }
  async ensureFriendshipWithAdmin(userId: number): Promise<void> { ... }
}
```

**Step 2: 验证**

```bash
pnpm build
```

---

## Task 4: Register + 修复 Login MFA

**Files:**
- Create: `src/auth/dto/register.dto.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.service.ts`（或新建 `password.service.ts` 承载 register）
- Create: `test/e2e/auth-register.e2e-spec.ts`

**Step 1: 写失败 e2e**

```typescript
describe('POST /api/auth/register (e2e)', () => {
  it('应返回 201 和 tokens', async () => {
    const username = `reg_${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password: 'Test@1234', email: 'a@b.com' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.username).toBe(username);
  });
});
```

**Step 2: 运行确认失败**

```bash
pnpm test:e2e -- auth-register
```

Expected: 404 FAIL

**Step 3: 实现 RegisterDto**

```typescript
export class RegisterDto {
  @IsString() @MinLength(3) @MaxLength(50) username!: string;
  @IsString() @MinLength(1) password!: string;
  @IsOptional() @IsEmail() email?: string;
}
```

**Step 4: 实现 register 方法**

逻辑对齐 Express `register`（`auth.controller.ts:244-385`）：

- 校验用户名 3-50、密码强度
- 唯一性检查 username / email
- 事务：创建 user + refreshToken + loginLog
- `storageQuota` 从 `getSystemSettings().storageQuotaUserBytes`
- 事务后 `adminFriendService.ensureFriendshipWithAdmin`（try/catch，失败不阻断）
- 返回 201 + user DTO + tokens

**Step 5: 修复 login MFA mfaToken**

在 `auth.service.ts` login 的 MFA 分支，从 Express 移植 `signMfaLoginToken`：

```typescript
// src/auth/mfa.service.ts 或 auth.service 内 private
const MFA_LOGIN_JWT_TYP = 'mfa_login';
signMfaLoginToken({ uid, finalMustChange, needPolicyChange }): string {
  return this.jwtService.sign(
    { typ: MFA_LOGIN_JWT_TYP, uid, fc: finalMustChange ? 1 : 0, pc: needPolicyChange ? 1 : 0 },
    { expiresIn: '5m' },
  );
}
```

将 `data: { mfaToken: null, expiresIn: 300 }` 改为真实 token。

**Step 6: 补全 login 的 password_policy 字段**

当 `needPolicyChange` 时，login 响应 data 增加：

```typescript
...(needPolicyChange ? {
  password_policy_hint: this.passwordPolicy.describePasswordPolicy(policy),
  password_policy: this.passwordPolicy.policyToPublicDTO(policy),
} : {})
```

**Step 7: Controller 挂载**

```typescript
@Public()
@Post('register')
register(@Body() dto: RegisterDto, @Req() req: Request) {
  return this.authService.register(dto, req);
}
```

**Step 8: 验证**

```bash
pnpm test:e2e -- auth-register
pnpm build
```

---

## Task 5: GET /api/auth/password-policy

**Files:**
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.service.ts`
- Create: `test/e2e/auth-password-policy.e2e-spec.ts`

**Step 1: 写失败 e2e**

```typescript
it('GET /api/auth/password-policy 应返回策略', async () => {
  const res = await request(app.getHttpServer()).get('/api/auth/password-policy');
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.minLength).toBeGreaterThan(0);
});
```

**Step 2: 实现**

```typescript
@Public()
@Get('password-policy')
getPasswordPolicy() {
  return this.authService.getPasswordPolicy();
}

// auth.service.ts
async getPasswordPolicy() {
  const settings = await this.passwordPolicy.getSystemSettings();
  const policy = this.passwordPolicy.settingsRowToPolicy(settings);
  return { success: true, data: this.passwordPolicy.policyToPublicDTO(policy) };
}
```

**Step 3: 验证**

```bash
pnpm test:e2e -- auth-password-policy
```

---

## Task 6: MfaService — verify + setup + disable

**Files:**
- Create: `src/auth/mfa.service.ts`
- Create: `src/auth/dto/mfa-verify.dto.ts`
- Create: `src/auth/dto/mfa-setup-confirm.dto.ts`
- Create: `src/auth/dto/mfa-disable.dto.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`
- Create: `test/e2e/auth-mfa.e2e-spec.ts`

**Step 1: 创建 MfaService**

从 Express 移植（使用 `otplib` 的 `generateSecret`, `generateURI`, `verifySync`）：

| 方法 | Express 函数 |
|------|-------------|
| `verifyMfaLogin(dto, req)` | `verifyMfaLogin` |
| `setupStart(userId)` | `mfaSetupStart` |
| `setupConfirm(userId, code)` | `mfaSetupConfirm` |
| `setupCancel(userId)` | `mfaSetupCancel` |
| `disable(userId, password, code)` | `mfaDisable` |

常量：`TOTP_ISSUER = 'FileManagement'`

`parseMfaLoginToken` / `signMfaLoginToken` 放在 MfaService 内。

`userUpdateData` 辅助（TOTP 字段 Prisma 类型兼容）：

```typescript
const userUpdateData = (d: Record<string, unknown>): Prisma.UserUpdateInput =>
  d as unknown as Prisma.UserUpdateInput;
```

**Step 2: Controller 路由**

```typescript
@Public()
@Post('mfa/verify')
verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
  return this.mfaService.verifyMfaLogin(dto, req);
}

@Post('mfa/setup/start')
setupStart(@CurrentUser() user: RequestUser) {
  return this.mfaService.setupStart(user.id);
}

@Post('mfa/setup/confirm')
setupConfirm(@CurrentUser() user: RequestUser, @Body() dto: MfaSetupConfirmDto) {
  return this.mfaService.setupConfirm(user.id, dto.code);
}

@Post('mfa/setup/cancel')
setupCancel(@CurrentUser() user: RequestUser) {
  return this.mfaService.setupCancel(user.id);
}

@Post('mfa/disable')
disable(@CurrentUser() user: RequestUser, @Body() dto: MfaDisableDto) {
  return this.mfaService.disable(user.id, dto.password, dto.code);
}
```

**Step 3: e2e 核心用例**

```typescript
describe('MFA flow (e2e)', () => {
  it('login 对未开启 MFA 用户返回 tokens', async () => { ... });
  it('POST /mfa/verify 无 token 返回 400', async () => {
    const res = await request(server).post('/api/auth/mfa/verify').send({});
    expect(res.status).toBe(400);
  });
  // setup start/confirm 需已登录用户 — 用 auth.helper loginAndGetTokens
});
```

**Step 4: 验证**

```bash
pnpm test:e2e -- auth-mfa
```

---

## Task 7: PasswordService — change-password

**Files:**
- Create: `src/auth/password.service.ts`
- Create: `src/auth/dto/change-password.dto.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`
- Create: `test/e2e/auth-change-password.e2e-spec.ts`

**Step 1: 写失败 e2e**

```typescript
it('已登录用户可修改密码', async () => {
  const { accessToken } = await loginAndGetTokens(app);
  const res = await request(server)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ currentPassword: 'Test@1234', newPassword: 'NewTest@5678' });
  expect(res.status).toBe(200);
  expect(res.body.data.accessToken).toBeDefined();
  expect(res.body.data.user.must_change_password).toBe(false);
});
```

**Step 2: 实现 PasswordService.changePassword**

对齐 Express `changePassword`（`auth.controller.ts:1041-1138`）：

- `mustChangePassword=true` 时不要求 `currentPassword`
- 否则校验当前密码
- 新密码强度校验；不能与旧密码相同
- 更新 password、`mustChangePassword=false`、`sessionVersion++`
- 返回新 `accessToken` + user DTO

**Step 3: Controller**

```typescript
@Post('change-password')
changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
  return this.passwordService.changePassword(user.id, dto);
}
```

> `MustChangePasswordGuard` 白名单已含 `/api/auth/change-password`，无需 `@SkipMustChangePassword`。

**Step 4: 验证**

```bash
pnpm test:e2e -- auth-change-password
```

---

## Task 8: GET /api/auth/me

**Files:**
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.service.ts`
- Create: `test/e2e/auth-me.e2e-spec.ts`

**Step 1: 写失败 e2e**

```typescript
it('GET /api/auth/me 返回当前用户', async () => {
  const { accessToken } = await loginAndGetTokens(app);
  const res = await request(server)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.username).toBeDefined();
  expect(res.body.data).toHaveProperty('totp_enabled');
  expect(res.body.data).toHaveProperty('mfa_setup_pending');
});
```

**Step 2: 实现 getCurrentUser**

对齐 Express `getCurrentUser` select 字段与 snake_case 响应。

**Step 3: Controller**

```typescript
@Get('me')
getMe(@CurrentUser() user: RequestUser) {
  return this.authService.getCurrentUser(user.id);
}
```

**Step 4: 验证**

```bash
pnpm test:e2e -- auth-me
```

---

## Task 9: Sessions — list + revoke

**Files:**
- Create: `src/auth/dto/sessions-list.dto.ts`
- Create: `src/auth/dto/sessions-revoke.dto.ts`
- Modify: `src/auth/session.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Create: `test/e2e/auth-sessions.e2e-spec.ts`

**Step 1: 写失败 e2e**

```typescript
it('POST /api/auth/sessions/list 返回会话列表', async () => {
  const { accessToken, refreshToken } = await loginAndGetTokens(app);
  const res = await request(server)
    .post('/api/auth/sessions/list')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ refreshToken });
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.data.sessions)).toBe(true);
});
```

**Step 2: 实现 SessionService 方法**

- `listSessionsForUser(userId, clientRefresh?)` — 对齐 `postMySessionsList`
- `revokeSessions(userId, ids, clientRefresh?)` — 对齐 `revokeMySessions`
  - 撤销包含当前会话时返回 **401** + `code: 'SESSION_REVOKED_SELF'`

```typescript
if (revokeSelf) {
  throw new UnauthorizedException({
    success: false,
    code: 'SESSION_REVOKED_SELF',
    message: '当前设备会话已登出，请重新登录',
  });
}
```

**Step 3: Controller**

```typescript
@Post('sessions/list')
listSessions(@CurrentUser() user: RequestUser, @Body() dto: SessionsListDto) {
  return this.sessionService.listSessionsForUser(user.id, dto.refreshToken);
}

@Post('sessions/revoke')
revokeSessions(@CurrentUser() user: RequestUser, @Body() dto: SessionsRevokeDto) {
  return this.sessionService.revokeSessions(user.id, dto.ids, dto.refreshToken);
}
```

**Step 4: 验证**

```bash
pnpm test:e2e -- auth-sessions
```

---

## Task 10: forgot-password

**Files:**
- Create: `src/auth/dto/forgot-password.dto.ts`
- Modify: `src/auth/password.service.ts`（或 auth.service）
- Modify: `src/auth/auth.controller.ts`
- Create: `test/e2e/auth-forgot-password.e2e-spec.ts`

**Step 1: 写失败 e2e**

```typescript
it('POST /api/auth/forgot-password 始终返回成功提示', async () => {
  const res = await request(server)
    .post('/api/auth/forgot-password')
    .send({ username: 'nonexistent_user_xyz' });
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('请等待管理员重置密码');
});
```

**Step 2: 实现 forgotPassword**

对齐 Express `forgotPasswordRequest`：

- 无 username → 400
- 查找 user + adminId
- 若有效：ensureFriendshipWithAdmin → 创建 message
- **Socket emit 暂不实现**（S9 补 `MessageNotifyService`）；DB 写入即可
- 始终返回 `{ success: true, message: '请等待管理员重置密码' }`

**Step 3: Controller**

```typescript
@Public()
@Post('forgot-password')
forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.passwordService.forgotPassword(dto.username);
}
```

**Step 4: 验证**

```bash
pnpm test:e2e -- auth-forgot-password
```

---

## Task 11: 全量 Auth e2e 回归

**Files:**
- Create: `test/e2e/auth.e2e-spec.ts`（聚合或引用各子套件）
- Modify: `test/e2e/auth-*.e2e-spec.ts`（补齐边界用例）

**Step 1: 补全边界用例清单**

| 端点 | 用例 |
|------|------|
| login | 错误密码 401、禁用用户 403、缺字段 400 |
| login | 会话上限 409 + `SESSION_LIMIT`（需预置 2 个 refreshToken） |
| refresh | 无效 token 401 |
| logout | 无 body 也 200 |
| register | 重复用户名 400 |
| mfa/verify | 过期 mfaToken 401 |
| change-password | 弱密码 400 |
| sessions/revoke | 空 ids 400 |

**Step 2: 运行全量 e2e**

```bash
pnpm test:e2e
```

Expected: 全部 PASS

**Step 3: 对比 Express 抽测（手测清单）**

```bash
# 终端 1: Express :3000
cd ../file_management_backend && pnpm dev

# 终端 2: Nest :3002
cd ../file_management_backend_nest && pnpm start:dev

# 同一账号分别请求，对比 status + 关键字段
curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"..."}'
curl -s -X POST http://localhost:3002/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"..."}'
```

---

## Task 12: 更新文档与进度

**Files:**
- Modify: `MIGRATION.md`
- Modify: `docs/plans/2026-07-06-nest-migration-design.md`（§9 进度表 Auth → 15/15）

**Step 1: 更新 MIGRATION.md 阶段表**

```markdown
| P2 | Auth 15 端点全量 | ✅ |
```

**Step 2: API 对照表补全 15 行**

**Step 3: 前端灰度说明**

```markdown
## S1 验收后前端切换
VITE_API_BASE_URL=http://localhost:3002
验证：注册、登录、MFA、会话管理、改密、忘记密码
回退：改回 http://localhost:3000
```

---

## 最终验收清单

- [ ] `pnpm build` 无错误
- [ ] `pnpm test:e2e` 全绿
- [ ] Auth 15 端点与 Express 响应结构一致
- [ ] `MustChangePasswordGuard` 白名单路由正常（change-password 可访问）
- [ ] login MFA 返回真实 `mfaToken`（非 null）
- [ ] Express `file_management_backend` 无任何代码改动
- [ ] 前端切 3002 登录全流程无回归

---

## 文件变更总览

| 操作 | 路径 |
|------|------|
| Create | `src/auth/session.service.ts` |
| Create | `src/auth/mfa.service.ts` |
| Create | `src/auth/password.service.ts` |
| Create | `src/common/admin-friend/admin-friend.service.ts` |
| Create | `src/common/admin-friend/admin-friend.module.ts` |
| Create | `src/auth/dto/register.dto.ts` |
| Create | `src/auth/dto/mfa-*.dto.ts` |
| Create | `src/auth/dto/change-password.dto.ts` |
| Create | `src/auth/dto/sessions-*.dto.ts` |
| Create | `src/auth/dto/forgot-password.dto.ts` |
| Create | `test/helpers/app-bootstrap.ts` |
| Create | `test/helpers/auth.helper.ts` |
| Create | `test/e2e/auth*.e2e-spec.ts` |
| Modify | `src/auth/auth.controller.ts` |
| Modify | `src/auth/auth.service.ts` |
| Modify | `src/auth/auth.module.ts` |
| Modify | `src/common/password-policy/password-policy.service.ts` |
| Modify | `MIGRATION.md` |

---

*计划版本：v1.0 · 对应设计文档 S1 阶段 · 预估 3 天（半职 4h/天）*
