# 音视频转写与字幕概念：ASR / segments / VTT / SRT

> 来源：F-25 视频方案 kickoff 前，对「转写、分句、字幕格式」的对齐讨论整理  
> 日期：2026-07-23  
> 关联：  
> - PRD [2026-07-08-ai-features-prd.md](../plans/2026-07-08-ai-features-prd.md) § F-25  
> - 音频实现 [2026-07-21-F25-音频转文字-实现方案.md](../plans/2026-07-21-F25-音频转文字-实现方案.md)  
> - 视频实现 [2026-07-23-F25-视频抽音轨与总结-实现方案.md](../plans/2026-07-23-F25-视频抽音轨与总结-实现方案.md)  
> - 代码：`src/files/ai/index/provider/asr.provider.ts`、`types/asr.types.ts`、`DocumentChunk.startMs/endMs`  
> 说明：弄清这几个词，再谈「AI 文稿 / AI 字幕 / 章节跳转」，避免把「识别」「时间轴数据」「字幕文件格式」混成一件事。

---

## 目录

1. [总览：一条流水线里的四个角色](#1-总览一条流水线里的四个角色)
2. [ASR：语音转文字](#2-asr语音转文字)
3. [segments：带时间的分句](#3-segments带时间的分句)
4. [VTT：网页跟读用的字幕格式](#4-vtt网页跟读用的字幕格式)
5. [SRT：下载/本地播放器用的字幕格式](#5-srt下载本地播放器用的字幕格式)
6. [VTT vs SRT 对照](#6-vtt-vs-srt-对照)
7. [和本项目的对应关系](#7-和本项目的对应关系)
8. [常见误解](#8-常见误解)
9. [速查表](#9-速查表)

---

## 1. 总览：一条流水线里的四个角色

用户看到的「AI 字幕 / 转写文稿」，背后通常是：

```
视频/音频文件
    →（视频则先抽音轨）
    → ASR（语音识别服务）
    → segments（带起止时间的句子列表）  ← 核心中间数据
    → 多种「呈现」：
         ├─ 文稿列表（点一句跳到画面）
         ├─ WebVTT → <video><track> 跟读
         ├─ SRT 文件 → 用户下载 / 本地播放器
         └─（可选）再拿全文做摘要、RAG
```

记住一句话：

> **ASR 负责「听」；segments 负责「记下什么时候说了什么」；VTT/SRT 只是把同一份 segments 包装成不同字幕文件。**

---

## 2. ASR：语音转文字

### 2.1 是什么

**ASR** = **Automatic Speech Recognition**（自动语音识别）。

输入：一段音频（wav/mp3，或从视频抽出来的音轨）。  
输出：对应的文本；多数云 API 还能顺带给出**按句/按词的时间戳**。

它解决的是：**「声音里的人话 → 文字」**，不负责：

- 理解剧情并写「章节摘要」（那是后面的 LLM 摘要）
- 生成漂亮的 `.srt` 文件（那是格式化步骤）
- 纠正同音错字到「可出版」质量（项目里记在 **F-41 纠偏**，不挡当前视频 MVP）

### 2.2 在本项目里怎么用

- 云端兼容接口（如硅基 SenseVoice / Whisper 风格 `/audio/transcriptions`）
- 实现：`src/files/ai/index/provider/asr.provider.ts`
- 音频路径已通：下载 → `prepareAudioForAsr`（ffmpeg 转成 16k 单声道 wav）→ ASR
- 视频 MVP：同一套 prep（ffmpeg 已 `.noVideo()`，可直接吃视频文件抽音轨）→ 同一 ASR

### 2.3 和「字幕」的关系

很多人说「AI 生成字幕」，听起来像一个黑盒功能。拆开后是：

1. ASR 产出带时间的文本（segments）  
2. 再把 segments **编码**成 VTT 或 SRT  

所以：**字幕质量上限 ≈ ASR 质量**；格式本身不会让字变更准。

---

## 3. segments：带时间的分句

### 3.1 是什么

**segment**（分段 / 分句）= ASR 结果里的**一条带时间轴的记录**，不是整篇糊成一坨的纯字符串。

概念形状（与本仓库类型一致）：

```ts
type AsrSegment = {
  text: string;   // 这一句说了什么
  startMs: number; // 开始时间（毫秒）
  endMs: number;   // 结束时间（毫秒）
};

type AsrTranscript = {
  text: string;           // 全文（可拼接）
  segments: AsrSegment[]; // 分句列表
};
```

代码：`src/files/ai/index/types/asr.types.ts`。

### 3.2 举例

假设对白是「大家好，今天讲网盘」：

| # | text | startMs | endMs | 含义 |
|---|------|---------|-------|------|
| 0 | 大家好 | 0 | 1200 | 0.0s～1.2s |
| 1 | 今天讲网盘 | 1200 | 3500 | 1.2s～3.5s |

有了它，产品才能做：

- **文稿列表**：一行一句，点第 2 行 → `video.currentTime = 1.2`
- **播放跟读**：当前播放进度落在哪一段，就高亮/显示哪一句
- **入库检索**：每句写成 `DocumentChunk`，带 `startMs` / `endMs`，以后 RAG 可以引用时间段

### 3.3 和 DocumentChunk 的关系

索引 Worker 对音视频大致是：

> 每个（或合并后的）segment → 一条 `DocumentChunk`（`content` + `startMs` + `endMs`）

因此：

- **segments** = ASR 刚返回时的内存/API 形态  
- **DocumentChunk** = 落库后的持久形态（还可再 embedding，供语义检索）

前端「拉文稿」走的 `GET .../ai/transcript`，本质上是把库里带时间戳的 chunk **再读成 segments 列表**给 UI。

### 3.4 为什么必须强调「带时间」

只有全文、没有起止时间，就只能：

- 给人看一大段字  
- **不能**可靠地点击跳播  
- **不能**做跟读字幕  

时间轴是音视频体验相对「纯文本文档索引」的关键增量。

---

## 4. VTT：网页跟读用的字幕格式

### 4.1 是什么

**VTT** = **WebVTT**（Web Video Text Tracks），常见扩展名 `.vtt`。

浏览器原生支持：在 `<video>` 上挂

```html
<track kind="subtitles" srclang="zh" label="AI" src="blob:....vtt" />
```

即可在播放时显示字幕轨（具体样式因浏览器而异）。

### 4.2 文件长什么样

```text
WEBVTT

00:00:00.000 --> 00:00:01.200
大家好

00:00:01.200 --> 00:00:03.500
今天讲网盘
```

注意：

- 第一行必须是 `WEBVTT`
- 时间用 **点** 分隔毫秒：`00:00:01.200`
- 两条字幕之间通常空一行

### 4.3 在本项目方案里的角色（F-25 视频 UX C）

- **跟读字幕**：用 segments **在前端（或后端）拼出 VTT 字符串** → `Blob` + `URL.createObjectURL` → 赋给 `<track src>`
- 数据源仍是同一份 transcript，**不另跑模型**

适合：网盘网页播放器内「打开就能看字幕」。

---

## 5. SRT：下载 / 本地播放器用的字幕格式

### 5.1 是什么

**SRT** = **SubRip Subtitle**，扩展名 `.srt`。  
历史久、生态大：PotPlayer、VLC、手机播放器、剪辑软件大多能直接加载同名或外挂 `.srt`。

### 5.2 文件长什么样

```text
1
00:00:00,000 --> 00:00:01,200
大家好

2
00:00:01,200 --> 00:00:03,500
今天讲网盘
```

注意：

- **没有** `WEBVTT` 头，从序号 `1` 开始
- 每条：序号 → 时间行 → 文本 → 空行
- 时间用 **逗号** 分隔毫秒：`00:00:01,200`（和 VTT 的点不同）

### 5.3 在本项目方案里的角色

- **导出下载**：用户点「导出字幕」→ 浏览器下载 `某视频.srt`
- 用户可把 SRT 和视频放一起，用本地播放器观看
- 同样由 **segments 格式化**而来，不第二次调用 ASR

---

## 6. VTT vs SRT 对照

| 维度 | VTT（WebVTT） | SRT（SubRip） |
|------|---------------|---------------|
| 典型用途 | 网页 `<video>` / `<track>` 跟读 | 下载、本地播放器、剪辑 |
| 文件头 | 需要 `WEBVTT` | 无 |
| 时间毫秒分隔符 | `.`（点） | `,`（逗号） |
| 序号 | 可选/风格不同 | 每条有递增序号 |
| 浏览器原生 | 好 | 一般不当作 `<track>` 首选 |
| 本项目 MVP | 跟读 | 导出 |

**相同点：** 都只是「时间 + 文本」的容器；**内容来自同一批 segments**。

---

## 7. 和本项目的对应关系

### 7.1 数据流（音频已交付；视频按 2026-07-23 方案扩展）

```
Storage 中的 audio/* 或 video/*
  → ffmpeg 准备 16k mono wav（视频走 .noVideo() 抽轨）
  → asr.provider → AsrTranscript { text, segments }
  → DocumentChunk（content + startMs + endMs）+ embedding + 摘要
  → 前端：
       文稿列表 ← transcript API（segments）
       跳播     ← segment.startMs
       跟读     ← segments → VTT → <track>
       导出     ← segments → SRT 文件
```

### 7.2 和「视频总结」的关系

| 产物 | 依赖 | 是否另需 LLM |
|------|------|----------------|
| 文稿 / 字幕 | ASR + segments | 否 |
| 结构化总结 / 章节 | 转写全文（或分窗） | 是（现有 Map-Reduce 摘要） |

总结和字幕**共享上游转写**，但总结不是字幕格式的一种。

### 7.3 和 F-41 的关系

ASR 会有同音字、断句问题；字幕一跟读，错字更显眼。  
**F-41（纠偏/手改）** 改的是 segments/chunk 文本质量；改完后 VTT/SRT 应基于**最新文稿**再生成。当前视频 MVP **不挡** F-41。

---

## 8. 常见误解

| 误解 | 纠正 |
|------|------|
| 「做 AI 字幕 = 再训/再调一个字幕模型」 | MVP 就是 ASR + 格式化；没有单独的「字幕模型」 |
| 「VTT 和 SRT 是两套识别结果」 | 否，通常一份 segments，两种导出 |
| 「有了全文 text 就够做跳播」 | 不够；跳播和跟读依赖 start/end |
| 「摘要 Tab 里的章节 = SRT」 | 章节是 LLM 结构化摘要；SRT 是逐句时间轴字幕 |
| 「ffmpeg 就是 ASR」 | ffmpeg 只做抽轨/转码；ASR 才是认人声 |

---

## 9. 速查表

| 名词 | 一句话 | 本项目落点 |
|------|--------|------------|
| **ASR** | 语音 → 文字（可带时间戳） | `asr.provider.ts` |
| **segments** | 「何时说了何句」的列表 | `AsrSegment`；入库 `DocumentChunk.startMs/endMs` |
| **VTT** | 网页字幕轨格式 | 播放器 `<track>` 跟读 |
| **SRT** | 通用下载字幕格式 | 「导出字幕」下载 |
| **抽音轨** | 视频里取出音频再给 ASR | `prepareAudioForAsr`（`.noVideo()`） |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-23 | 初版：kickoff 对齐 ASR / segments / VTT / SRT，并挂到 F-25 音视频方案 |
