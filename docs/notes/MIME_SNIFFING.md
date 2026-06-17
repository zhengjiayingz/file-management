# MIME 嗅探攻击与 `X-Content-Type-Options: nosniff`

> 阶段三（Helmet）相关概念笔记。  
> 对应任务：[NODE_BACKEND_实施任务清单.md](../NODE_BACKEND_实施任务清单.md) **3.1 Helmet**

---

## 一句话

**MIME 嗅探攻击**：利用浏览器「不严格按 `Content-Type`、而是自己猜文件类型」的行为，让本不该被当作网页/脚本执行的内容（如含 `<script>` 的文本）被错误执行；`X-Content-Type-Options: nosniff` 用于关闭这种猜测。

---

## 正常情况

服务器返回：

```http
Content-Type: text/plain
```

浏览器应按**纯文本**显示，**不执行**其中的 HTML/JavaScript。

---

## 什么是 MIME 嗅探（MIME Sniffing）？

部分浏览器（尤其旧版本）在收到响应后，除了看 `Content-Type`，还会**查看文件内容**：

- 若内容「看起来像 HTML / JavaScript」
- 浏览器可能**忽略**你声明的 `text/plain`
- 改按网页或脚本去解析、执行

这叫 **MIME 嗅探**——浏览器在「嗅」内容，自行判断类型。

---

## 攻击怎么发生？

典型利用链：

1. 攻击者上传或托管一个文件，表面是文本，内容里藏着 `<script>...</script>` 等恶意代码  
2. 服务器（或配置失误）返回 `Content-Type: text/plain`，或类型声明不准确  
3. 用户浏览器访问该 URL  
4. 浏览器**嗅探**后当作 HTML/JS 执行 → 可能触发 **XSS（跨站脚本）**

本质问题：**声明的类型是 A，浏览器却按 B 处理**。

---

## 和本项目的联系：Helmet

阶段三任务 **3.1** 会在生产环境启用 [helmet](https://helmetjs.github.io/)，其中包含设置：

```http
X-Content-Type-Options: nosniff
```

含义：

| 有 `nosniff` | 无 `nosniff`（或老浏览器） |
|--------------|---------------------------|
| 必须按 `Content-Type` 解析 | 可能根据内容「猜」类型 |
| `text/plain` 只当文本 | 含脚本的「文本」可能被当 HTML 执行 |

**目的**：生产环境达到「有基础安全头」的及格线，降低 MIME 嗅探导致的 XSS 风险。

本项目约定：**仅在 `NODE_ENV=production` 时启用 helmet**，开发环境不挡调试。

---

## 面试 / 口述模板

> MIME 嗅探是浏览器根据内容猜测资源类型，可能绕过错误的 `Content-Type` 执行脚本。我们通过 Helmet 设置 `X-Content-Type-Options: nosniff`，强制浏览器遵守声明类型，属于 HTTP 安全基线之一。

---

## 补充说明

- 现代浏览器对嗅探已比过去严格，但生产环境加 `nosniff` 仍是**低成本、常见**的做法。  
- `nosniff` 主要防「类型声明与执行方式不一致」；不能替代：上传校验、CSP、输出转义等其它 XSS 防护。  
- 文件上传场景还应配合：**扩展名 + MIME 双校验**（补强文档 M3.4）。

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [HELMET.md](./HELMET.md) | Helmet 中间件与全部安全响应头说明 |
| [NODE_BACKEND_实施任务清单.md](../NODE_BACKEND_实施任务清单.md) | 阶段三 3.1～3.3 |

---

**更新日期**：2026-06-06
