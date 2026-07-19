# F-27 相关概念：新技术点 / LaTeX·KaTeX / VL / SSE（问答整理）

> 来源：F-27 截图解题开发前后讨论整理（预览实现联调 → 回滚带写前概念澄清）  
> 日期：2026-07-18  
> 关联：  
> - PRD：[2026-07-08-ai-features-prd.md](../plans/2026-07-08-ai-features-prd.md) § F-27  
> - 产品约定：[2026-07-18-F27-截图数学解题-产品约定.md](../plans/2026-07-18-F27-截图数学解题-产品约定.md)  
> - 实现方案：[2026-07-18-F27-截图数学解题-实现方案.md](../plans/2026-07-18-F27-截图数学解题-实现方案.md)（S18c ✅）  
> - 前置概念：[2026-07-17-视觉-OCR-VL-CLIP-学习笔记.md](./2026-07-17-视觉-OCR-VL-CLIP-学习笔记.md)（OCR vs VL vs CLIP）  
> 说明：把「F-27 新不新、公式怎么显示、VL 怎么接到 Nest、SSE 是什么」写清楚，方便回滚后带写与面试口述。

---

## 目录

1. [问答一：F-27 有没有用到新的技术点？](#问答一f-27-有没有用到新的技术点)
2. [问答二：KaTeX 和 LaTeX 是什么？](#问答二katex-和-latex-是什么)
3. [问答三：VL 是什么？和大模型、后端怎么交互？](#问答三vl-是什么和大模型后端怎么交互)
4. [问答四：SSE 是什么？](#问答四sse-是什么)
5. [概念关系总图](#概念关系总图)
6. [和本项目代码的对应（带写时对照）](#和本项目代码的对应带写时对照)
7. [选型与踩坑速查](#选型与踩坑速查)

---

## 问答一：F-27 有没有用到新的技术点？

### 问题

> 我准备回滚代码，让你一步步带我做。先分析一下这个功能有没有使用到新的技术点。

### 结论（先看这个）

**有新点，但不是从零换技术栈。**  
多数是在现有 AI 能力上的**组合复用**；真正值得当「新专题」练的主要是两块：

1. **VL 多模态流式对话**（相对 F-26 OCR 是升级）  
2. **KaTeX 公式渲染**（前端新依赖）

其余（流式 fetch、Nest Service/Controller、DocumentAiPanel 多模式、Storage 读文件、多模型 env）都是熟悉路径。

### 相对已有能力：主要是复用

| 你们已经做过 | F-27 怎么用 |
|--------------|-------------|
| 划词 / RAG / 翻译流式（`fetch` + 文本流） | 解题流式前端同套路 |
| `vision.provider`：读图 + base64 + 硅基 `chat/completions` | 解题也是读盘 → data URL → 硅基（任务从「OCR」换成「解题」） |
| 多模型 env 分流（`AI_*` / `AI_VISION_*`） | 再加一套 `AI_MATH_VISION_*`（可同一把 Key，**模型必须是 VL**） |
| `DocumentAiPanel` 多模式 + AbortController | 多一个 `solve` 模式 / 独立消息列表 |
| Storage 读网盘文件 | 解题取图同链路 |
| **不进** `document-index.processor` 的交互能力（如划词） | 解题同样不进索引 Worker |

因此：**Nest 模块拆分、鉴权、流式 HTTP、面板状态机**，带写时属于「练熟」，不是第一次见。

### 真正偏新的两点

#### （1）VL 多模态对话（相对 F-26）

| | F-26 OCR | F-27 VL 解题 |
|--|----------|--------------|
| 任务 | 图 → **纯文字** | 图 + 文字问题 → **分步解答** |
| 轮次 | 通常一次 | 可多轮追问（每轮带图 + 近 N 轮文字） |
| 对用户 | 进索引 / OCR 面板 | **当场流式**出解答 |
| 进 Worker？ | 索引路径会进 | **不进** index Worker |

消息形态（OpenAI 兼容）示意：

```json
{
  "role": "user",
  "content": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },
    { "type": "text", "text": "请分步解答本题" }
  ]
}
```

预览实现里为兼容硅基 VL，曾用手写解析 **SSE**（`data: {...}`），而不只依赖 AI SDK `streamText`——这是实现细节，概念上仍是「流式 chat completions」。

**面试可讲：** OCR 与 VL 分线；索引用 OCR、交互用 VL；每轮带原图 + 历史截断 N=6。

#### （2）KaTeX 公式渲染（前端）

- 以前：`marked` + DOMPurify → 只渲 Markdown  
- F-27：模型输出 LaTeX（`$` / `$$`）→ 前端用 **KaTeX** 画成公式  
- 还要处理：流式半截公式乱、AI 乱吐 `$$\n...\n$$` 换行块

**面试可讲：** 数学域展示；流式容错 + 结束全量重渲。

### 偏工程/产品、不算新技术

- 独立解题会话；切入清空划词/RAG；关 Dialog 才清解题历史  
- 顶栏「解题」、验算文案  
- 面板滚轮隔离 / flex 高度出滚动条（体验坑）  
- **必须配置 VL 模型**：误用纯文本模型（如某些非 VL 的 Qwen）会出现**空回答**——这是配置认知，不是新框架  

**文档已记、本期未做：** 临时上传 `tempImageId`、错题本落库 → 见 F-27 产品约定「中间态」，留给 F-29 / 增强期。

### 回滚后带写建议顺序

若目标是「学会新东西」：

1. 后端 VL 流式（读图 + `image_url` + 流式转发）← **核心**  
2. 前端 KaTeX ← **第二**  
3. 面板 `solve` 模式 / API 接线 ← 熟悉模式  

---

## 问答二：KaTeX 和 LaTeX 是什么？

### 问题

> KaTeX 和 LaTeX 是什么东西？

### LaTeX：公式的「源代码」写法

**LaTeX** 是一种用来**书写数学公式**（也常用来写论文排版）的标记语言。

人 / AI 不直接「画」分数线，而是写代码。例如：

| 含义 | LaTeX 写法（示意） |
|------|-------------------|
| 三分之四 | `\frac{3}{4}` |
| 积分 | `\int_0^1 x\,dx` |
| 根号 | `\sqrt{a^2+b^2}` |

在 Markdown / 聊天场景里，常用定界符包住：

- **行内：** `$E=mc^2$`  
- **独立公式块：** `$$ ... $$`（可跨多行）

**要点：** LaTeX 只是**文本**。浏览器默认不会把它变成漂亮公式；没有渲染器时，用户只能看到乱七八糟的反斜杠命令。

### KaTeX：把 LaTeX 画到网页上的 JS 库

**KaTeX** 是一个 **JavaScript 库**：输入 LaTeX 字符串，输出 HTML/CSS，在页面上显示排版好的公式。

```text
模型输出：  $$\frac{3}{4}$$
              ↓
         KaTeX.renderToString / 扩展
              ↓
页面显示：     ³⁄₄  那种排版效果
```

同类还有 **MathJax**。本项目选 KaTeX 的常见理由：更轻、渲染更快，适合聊天流式场景。

### 二者关系（记一句）

| 名字 | 角色 |
|------|------|
| **LaTeX** | 约定「公式怎么写」（模型输出的文本格式） |
| **KaTeX** | 约定「网页怎么画出来」（前端渲染库） |

没有 KaTeX：用户看到 `\frac{3}{4}`；有了 KaTeX：看到正常数学排版。

### 和 F-27 的产品约定

- System Prompt 要求模型用 `$` / `$$` 输出公式  
- 前端升级 `renderMarkdown`：先抽出公式用 KaTeX 渲染，再跑 Markdown（避免 AI 乱换行导致扩展解析失败）  
- 流式中允许半截公式暂时乱；**流结束**后用完整 Markdown 再渲一次，保证最终正确  

---

## 问答三：VL 是什么？和大模型、后端怎么交互？

### 问题

> VL 是个什么东西，和大模型还有我的后端是怎么交互的？

### VL 是什么

**VL** = **Vision-Language Model**（视觉语言模型）。

口语：**会看图的大模型**。

- 普通文本大模型（如你们划词/RAG 用的 DeepSeek）：输入主要是**文字**。  
- VL：还能接收 **图片 + 文字**，再按指令生成文字回答（描述、分类、解题步骤等）。

常见例子：`Qwen2-VL` / `Qwen3-VL`、GPT-4o 的看图能力等。

更完整的 OCR vs VL vs CLIP 见：[2026-07-17-视觉-OCR-VL-CLIP-学习笔记.md](./2026-07-17-视觉-OCR-VL-CLIP-学习笔记.md)。

### 和「大模型」的关系

| | 文本大模型（LLM） | VL 大模型 |
|--|------------------|-----------|
| 输入 | 主要是 text | **image + text** |
| 输出 | 文本 | 文本（也可结构化） |
| 本项目用法 | 划词、RAG、摘要、翻译 | F-27 截图解题 |

关系可记成：

```text
大模型（LLM）
  ├─ 纯文本模型：划词 / RAG / 摘要 …
  └─ VL（多模态）：多了视觉编码器，能看图 → 解题 / 看图问答 …
```

OCR（F-26 DeepSeek-OCR）也常走 `chat/completions`，但任务几乎固定成「认字」；  
VL 的任务由 **prompt** 决定：「这道题怎么解」「图里有什么」。

### 和 Nest 后端怎么交互（核心）

**后端不在本机跑 VL 权重**，只做中转与业务：

```text
浏览器
  → Nest（JWT 鉴权、校验图片、读 Storage、拼多模态请求）
    → 硅基流动等云端 API（真正跑 VL）
      ← 流式（或一次性）返回文本
  ← Nest 把文本写成 HTTP 流给前端
  ← 前端气泡追加；KaTeX 渲公式
```

解题路径（产品约定）示意：

1. 用户打开网盘图片预览 → 点「解题」  
2. 前端 `POST /api/files/:id/ai/solve-math`（body 含 `question`、可选 `messages`）  
3. Nest：归属校验 → MIME 白名单 → 读文件 buffer → `data:image/...;base64,...`  
4. Nest 调厂商 OpenAI 兼容接口，例如：

```http
POST {AI_MATH_VISION_BASE_URL}/chat/completions
Authorization: Bearer {AI_MATH_VISION_API_KEY}
```

```json
{
  "model": "Qwen/Qwen3-VL-8B-Instruct",
  "stream": true,
  "messages": [
    { "role": "system", "content": "分步解题…公式用 LaTeX…" },
    { "role": "user", "content": [
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },
      { "type": "text", "text": "请分步解答本题" }
    ]}
  ]
}
```

5. VL 在云端「看图 + 读题」→ 流式吐出解答（可含 LaTeX）  
6. Nest 解析流并转发 → 前端显示  

### 和 F-26 OCR 路径对比

```text
F-26 OCR：图 → 字 → 进索引 / 向量（Worker；一般不直接流式给用户解题）
F-27 VL ：图 + 问 → 当场流式解答（不进 document-index.processor）
```

环境变量建议分线（Key 可相同，模型不同）：

| 用途 | 典型 env | 典型模型角色 |
|------|----------|--------------|
| 文本对话 | `AI_*` | DeepSeek 等纯文本 |
| 索引 OCR | `AI_VISION_*` | DeepSeek-OCR |
| 截图解题 | `AI_MATH_VISION_*` | Qwen3-VL 等 **VL** |

**踩坑：** 解题若误配成纯文本模型，可能「请求成功但内容为空」——不是前端没接好，是模型根本看不了图。

### 一句话

**VL = 能看图的大模型；Nest 负责鉴权、读图、组多模态请求、转发流式结果；真正算答案的是云端 VL API。**

---

## 问答四：SSE 是什么？

### 问题

> SSE 是什么？

### 定义

**SSE** = **Server-Sent Events**（服务端推送事件）。

一种让**服务器在一条 HTTP 连接上持续往客户端推数据**的机制：请求建立后，服务端可以一段一段往下写，客户端边收边显示。特别适合「大模型流式输出」。

### 和普通接口的差别

| | 普通 JSON 接口 | SSE / 流式响应 |
|--|----------------|----------------|
| 何时返回 | 等全部算完，一次给全文 | 边算边推，一段段回来 |
| 用户体验 | 长时间转圈后突然出全文 | 字逐渐冒出（ChatGPT 感） |
| 方向 | 请求 → 完整响应 | 长连接上**服务端单向推** |

说明：需要**双向**实时（双方随时互发）时更常用 WebSocket；你们「AI 流式回答」用 SSE 或「纯文本流式写 body」通常就够。

### 厂商 API 里 SSE 长什么样

硅基等 OpenAI 兼容接口在 `stream: true` 时，响应体常为：

```text
data: {"choices":[{"delta":{"content":"第"}}]}

data: {"choices":[{"delta":{"content":"一"}}]}

data: {"choices":[{"delta":{"content":"步"}}]}

data: [DONE]
```

每一行以 `data:` 开头的是一块事件；后端解析 JSON 取出 `delta.content`，再转发给浏览器。

### 和你们项目的关系

- **划词 / RAG / 翻译：** 后端常用 AI SDK 的 `pipeTextStreamToResponse`，浏览器收到的往往是连续的 **text/plain 文本流**（不一定带 `data:` 前缀），但本质同样是「流式写 HTTP 响应」。  
- **对接硅基 VL：** 若直接 `fetch` 厂商接口，可能要自己读上面的 `data:` SSE，抽出文字，再 `res.write(chunk)` 给前端。  
- **前端统一体验：** `fetch` → `response.body.getReader()` → 每读到一块就往气泡 `content` 追加；可 Abort 取消。

### 一句话

**SSE 就是「一条 HTTP 连接上，服务器持续推事件/文本」；用来做大模型流式回答，不用等整篇生成完。**

---

## 概念关系总图

```text
┌─────────────────────────────────────────────────────────────┐
│ 用户：图片预览 →「解题」→ 看流式解答（含公式）              │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST .../ai/solve-math
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Nest 后端                                                    │
│  · 鉴权 / 校验图片 / 读 Storage                              │
│  · 拼 system + history + image(base64) + 近 N 轮文字           │
│  · 调云端 VL（流式）· 解析 SSE 或管道文本流 · 转发给前端    │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS chat/completions (stream)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 云端 VL 大模型（Vision-Language）                            │
│  · 看图 + 读题 → 生成解答文本（可含 LaTeX 源码）             │
└───────────────────────────┬─────────────────────────────────┘
                            │ 流式 token / 文本块
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 前端                                                         │
│  · 流式追加气泡                                              │
│  · LaTeX 源码 ──KaTeX──→ 排版好的公式 HTML                   │
└─────────────────────────────────────────────────────────────┘

对照（不要混线）：
  F-26 OCR ──图→字──→ 索引 Worker / RAG 检索
  F-27 VL  ──图+问→答──→ 交互流式（不进索引 Worker）
```

---

## 和本项目代码的对应（带写时对照）

> 回滚后路径以当时仓库为准；下列为预览实现 / 方案中的典型落点。

| 概念 | 典型落点 |
|------|----------|
| OCR（F-26） | `src/files/ai/vision/vision.provider.ts` → `extractTextFromImage` |
| VL 配置 / 流式 | `math-vision.provider` + `files-ai-math.service`（方案名） |
| 路由 | `POST /api/files/:id/ai/solve-math`（`FilesAiController`） |
| 前端流式 | `src/api/ai.ts` → `streamSolveMath`（对齐 `streamAsk` / `streamTranslate`） |
| 解题 UI | `DocumentAiPanel` 的 `solve` 模式；`ImageDocumentPreviewDialog` 顶栏 CTA |
| LaTeX → 显示 | `src/utils/renderMarkdown.ts` + `katex` CSS |
| 产品约定 | `docs/plans/2026-07-18-F27-截图数学解题-产品约定.md` |

**明确不做进索引：** 解题 Service **不得**写入 `document-index.processor`。

---

## 选型与踩坑速查

| 场景 | 建议 |
|------|------|
| 只要图上的字进检索 | OCR（F-26），不要上 VL |
| 要看图解题 / 看图问答 | VL（F-27），不要用纯文本模型冒充 |
| 公式显示乱 / 露出 `$$` | 查 KaTeX 是否生效、定界符是否完整、流是否已结束再全量渲 |
| 请求 200 但气泡空 | 优先查模型是否为 **VL**、Network `solve-math` 体是否有字；硅基勿用 AI SDK `{ type: 'image' }`（须 `image_url` + data URL，见落地 Provider） |
| 流式卡死 / 取消 | 前端 AbortController；后端 `req.on('close')` abort 上游 |
| 以后「临时截图不进网盘」 | `tempImageId` 中间态（产品约定已记，非本期） |

---

## 修订

| 日期 | 说明 |
|------|------|
| 2026-07-18 | 初版：汇总 F-27 新技术点 / LaTeX·KaTeX / VL·后端交互 / SSE 四轮问答 |

| 2026-07-19 | F-27 交付：补充硅基多模态须手写 `image_url` SSE（非 AI SDK image part） |
