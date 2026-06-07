# Helmet 中间件与 HTTP 安全响应头

> 阶段三 **3.1** 笔记：Helmet 的作用、加前后响应头对比、各字段含义。  
> 代码位置：`file_management_backend/src/createApp.ts`  
> 相关：[MIME_SNIFFING.md](./MIME_SNIFFING.md)（`X-Content-Type-Options: nosniff` 展开）

---

## 一、Helmet 是做什么的？

**Helmet** 是 Express 常用的安全中间件，在 **HTTP 响应头** 里自动加上一组浏览器侧安全策略。

| 维度 | 说明 |
|------|------|
| **改什么** | 响应头（Response Headers） |
| **不改什么** | JSON body、路由逻辑、数据库 |
| **防护层** | 浏览器如何解析、嵌入、跳转、加载资源 |
| **典型场景** | API 上线前的 HTTP 安全基线 |

**一句话**：让服务端告诉浏览器「别嗅探类型、别随便嵌 iframe、别乱加载脚本」等，降低 XSS、点击劫持、信息泄露等常见 Web 风险。

---

## 二、在本项目里加在哪里？

```typescript
// src/createApp.ts
import helmet from 'helmet';

export function createApp() {
  const app = express();

  // 任务 3.1：生产环境启用（验收时可临时去掉判断对比响应头）
  if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
  }

  app.use(cors({ /* ... */ }));
  // ...
}
```

| 要点 | 说明 |
|------|------|
| **文件** | `createApp.ts`（不是 `app.ts`） |
| **顺序** | `express()` 之后、路由之前，尽量靠前 |
| **范围** | 所有经 Express 发出的 HTTP 响应（`/health`、`/api/*` 等） |
| **生产约定** | 清单要求仅 `NODE_ENV=production` 时启用，开发默认关闭便于调试 |

**注意**：`app.ts` 里 `dotenv.config({ override: true })` 会把 `.env` 的 `NODE_ENV=development` 写回进程，shell 里 `$env:NODE_ENV='production'` 可能被覆盖。验收 Helmet 时可临时改 `.env` 为 `production`，或像 `PORT` 一样在 `app.ts` 保留 shell 传入的 `NODE_ENV`。

---

## 三、加 Helmet 前后对比（本地 `/health`）

### 加之前（典型）

```http
Content-Type: application/json; charset=utf-8
X-Powered-By: Express
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
...
```

### 加之后（Helmet 默认，多出的为主）

除 CORS、Content-Type 等原有头外，**新增**安全头，且 **`X-Powered-By: Express` 通常被移除**（减少暴露技术栈）。

### 如何自己对比

```powershell
# 浏览器 F12 → Network → 选请求 → Response Headers
# 或：
curl.exe -i http://localhost:3000/health
```

---

## 四、多出来的响应头字段含义

以下为 Helmet 8.x **默认** 常见头（具体值以你本地 `curl -i` 为准）。

### 总览表

| 响应头 | 一句话 |
|--------|--------|
| `Content-Security-Policy` | 限制页面能加载/执行哪些资源，防 XSS |
| `Cross-Origin-Opener-Policy` | 跨域新窗口不能滥用 `window.opener` |
| `Cross-Origin-Resource-Policy` | 默认禁止跨源读取该资源 |
| `Origin-Agent-Cluster` | 浏览器对该源使用独立 agent 集群，加强隔离 |
| `Referrer-Policy` | 控制跳转时是否发送 Referer，防 URL 泄露 |
| `Strict-Transport-Security` | 强制浏览器用 HTTPS 访问（生产 HTTPS 时最重要） |
| `X-Content-Type-Options` | 禁止 MIME 嗅探，必须遵守 `Content-Type` |
| `X-Dns-Prefetch-Control` | 关闭 DNS 预解析 |
| `X-Download-Options` | 下载文件不在浏览器内直接打开（旧 IE 场景） |
| `X-Frame-Options` | 限制谁可以把页面嵌进 iframe，防点击劫持 |
| `X-Permitted-Cross-Domain-Policies` | 不允许 Flash 跨域策略文件 |
| `X-Xss-Protection: 0` | 关闭 IE 过时内置 XSS 过滤器（现代推荐） |

### 消失的字段

| 响应头 | 变化 |
|--------|------|
| `X-Powered-By: Express` | Helmet 默认 **`hidePoweredBy`**，不再对外声明 Express |

---

## 五、各字段详细说明

### 1. `Content-Security-Policy`（CSP）

Helmet 默认会设置较长 CSP，大意包括：

| 指令 | 含义 |
|------|------|
| `default-src 'self'` | 默认只允许同源资源 |
| `base-uri 'self'` | `<base href>` 只能同源 |
| `font-src 'self' https: data:` | 字体：同源 / HTTPS / data URL |
| `form-action 'self'` | 表单只能提交到同源 |
| `frame-ancestors 'self'` | 只允许同源页面嵌入本页（iframe 祖先） |
| `img-src 'self' data:` | 图片：同源 / data URL |
| `object-src 'none'` | 禁止 `<object>` 等插件内容 |
| `script-src 'self'` | 脚本只允许同源 |
| `script-src-attr 'none'` | 禁止内联事件属性里的脚本 |
| `style-src 'self' https: 'unsafe-inline'` | 样式：同源 / HTTPS / 允许内联 style |
| `upgrade-insecure-requests` | 尽量把 HTTP 子资源升级为 HTTPS |

**作用**：纵深防御 XSS——即使混入恶意 markup，浏览器也尽量不让执行/加载。  
**注意**：若生产环境 Swagger UI 异常，可能需要单独调 CSP（与本 JSON API 主体无冲突时一般无感）。

---

### 2. `Cross-Origin-Opener-Policy: same-origin`

跨域打开的页面与当前页 **不共享** `window.opener` 的敏感能力。  
**防什么**：跨域页面通过 opener 操纵原标签（tabnabbing 类攻击）。

---

### 3. `Cross-Origin-Resource-Policy: same-origin`

默认仅 **同源** 可读取该资源（与 CORS 不同层：CORP 是资源侧策略）。  
**防什么**：其它站点跨域「读」你的 API/静态文件（在浏览器侧多一层限制）。

---

### 4. `Origin-Agent-Cluster: ?1`

浏览器将该 **源（origin）** 放入独立 agent cluster，与其它源进程隔离更强。  
现代 Chromium 系浏览器特性，对 API 透明。

---

### 5. `Referrer-Policy: no-referrer`

跳转到外部 URL 时 **不发送** `Referer` 头。  
**防什么**：URL 中带 token、路径信息泄露给第三方。

---

### 6. `Strict-Transport-Security`（HSTS）

示例：`max-age=31536000; includeSubDomains`

| 部分 | 含义 |
|------|------|
| `max-age=31536000` | 约 1 年内必须用 HTTPS 访问 |
| `includeSubDomains` | 子域名同样生效 |

**防什么**：SSL 剥离、中间人降级到 HTTP。  
**本地 http://localhost**：头会出现，但浏览器通常不会像生产 HTTPS 那样严格强制；**主要价值在正式 HTTPS 域名**。

---

### 7. `X-Content-Type-Options: nosniff`

禁止浏览器 **MIME 嗅探**，必须按 `Content-Type` 解析。  
详见 [MIME_SNIFFING.md](./MIME_SNIFFING.md)。

---

### 8. `X-Dns-Prefetch-Control: off`

关闭浏览器 DNS 预取。略增隐私，对现代 API 影响很小。

---

### 9. `X-Download-Options: noopen`

（主要针对旧 IE/Edge）下载时在 **保存** 而非在浏览器内 **打开**，降低「下载物被当网页执行」风险。

---

### 10. `X-Frame-Options: SAMEORIGIN`

仅 **同源** 站点可将此页嵌入 iframe。  
**防什么**：点击劫持——攻击者用透明 iframe 盖在诱骗按钮上。

---

### 11. `X-Permitted-Cross-Domain-Policies: none`

不允许 Adobe/Flash 式 `crossdomain.xml` 跨域策略。Flash 已淘汰，属遗留防护。

---

### 12. `X-Xss-Protection: 0`

**不是「关闭安全防护」**。  
IE 旧版内置 XSS Auditor 有已知 bypass，现代做法是用 CSP 等替代，故 Helmet **显式设为 0** 关掉过时机制。

---

## 六、与 CORS 头的关系（不是 Helmet 加的）

加 Helmet 后，下列头 **仍然存在**，来自 `cors` 中间件，不要误认为是 Helmet 新增：

| 头 | 作用 |
|----|------|
| `Access-Control-Allow-Origin` | 允许的前端源 |
| `Access-Control-Allow-Credentials` | 是否允许带 Cookie / Authorization |
| `Access-Control-Expose-Headers` | 前端可读 `Content-Disposition` 等 |
| `Vary: Origin` | 按 Origin 区分缓存 |

Helmet 管 **安全策略**；CORS 管 **跨域访问权限**。两者互补。

---

## 七、与其它安全任务的分工

| 任务 | 防护什么 |
|------|----------|
| **2.2 登录限流** | 登录接口被撞库、暴力尝试 |
| **3.1 Helmet** | HTTP 响应头 / 浏览器侧通用 Web 风险 |
| **3.2 全局限流** | 全站 API 被脚本狂刷 |
| **3.3 CORS 文档** | 生产环境跨域配置不当导致的安全问题 |

---

## 八、阶段三 3.1 验收清单

- [ ] `createApp.ts` 已 `import helmet` 并 `app.use(helmet())`（生产条件见上）
- [ ] `NODE_ENV=production` 下启动，日志为 `Environment: production`
- [ ] `curl.exe -i http://localhost:3000/health` 含 `X-Content-Type-Options: nosniff` 等
- [ ] 对比加 Helmet 前后：`X-Powered-By` 消失、安全头出现

---

## 九、面试一句话

> 生产环境在 Express 上挂 Helmet，自动为所有响应加上 CSP、HSTS、X-Frame-Options、nosniff 等 HTTP 安全头，隐藏 `X-Powered-By`，属于低成本的安全基线；与登录限流、全局限流、CORS 白名单形成纵深防御。

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [MIME_SNIFFING.md](./MIME_SNIFFING.md) | `nosniff` 与 MIME 嗅探攻击 |
| [NODE_BACKEND_实施任务清单.md](../NODE_BACKEND_实施任务清单.md) | 阶段三 3.1～3.3 |
| [NODE_BACKEND_STRENGTHENING.md](../NODE_BACKEND_STRENGTHENING.md) | M3 安全加固 |

---

**更新日期**：2026-06-06
