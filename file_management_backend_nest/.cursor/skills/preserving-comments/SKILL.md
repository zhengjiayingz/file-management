---
name: preserving-comments
description: >-
  Preserve and relocate existing code comments when editing or refactoring.
  Use when modifying, refactoring, extracting, moving, or rewriting existing
  code; when splitting functions/files/modules; or whenever touching commented
  regions. Do not use only for brand-new files with no prior comments.
---

# 保留既有注释

修改已有代码时必须遵守下方规则（原文约定，勿弱化）：

> 修改代码的时候，如果发现有注释尽量把注释保留，如果代码结构拆开了，导致注释的地方需要改动，则移动原有注释到新位置，而不是删除。

## 操作清单

改代码前先扫目标区域附近的注释（行上、块前、JSDoc/`@`、`#`、`<!-- -->` 等）。

1. **能原样留就原样留** — 语句/块未搬走时，不要顺手删注释来「清理」。
2. **结构拆开就跟着搬** — 提取函数、搬家、拆文件时，把**原注释**一并挪到仍描述同一意图的新位置。
3. **禁止用「重写」代替搬迁** — 不要删掉旧注释再写一句含义不同的新注释，除非用户明确要求改写注释。
4. **过时再改写，而非先删** — 若逻辑已变导致注释不准：先移到新位置，再**最小改动**纠正，不要整段删除。

## 正反例

```ts
// ❌ BAD：拆函数时删掉原注释
function load() {
  const raw = read();
  return parse(raw);
}

// ✅ GOOD：原注释跟随逻辑到新位置
function load() {
  // 必须先读盘再 parse，避免空缓冲
  const raw = read();
  return parse(raw);
}
```

```ts
// ❌ BAD：重构后丢掉 JSDoc
function fetchUser(id: string) { ... }

// ✅ GOOD：JSDoc 随符号迁移
/** 按 id 拉取用户；不存在则抛 NotFoundError */
function fetchUser(id: string) { ... }
```

## 例外（仅这些情况可不保留）

- 用户**明确**要求删注释 / 清理文档
- 注释已是纯噪声（如大段被注释掉的死代码，且本次就是在删死代码）
- 项目规范或 linter **强制禁止**该类注释（按规范处理，并在回复里说明）
