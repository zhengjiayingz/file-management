---
name: code-reuse-boundaries
description: >-
  Enforces legitimate code reuse: never bypass class private via bracket access
  or similar hacks; never copy-paste the same method into another file—extract
  shared logic instead. Use when writing or refactoring code, sharing helpers
  across services/classes, accessing another class's private/protected methods,
  or when tempted to duplicate a method or use obj['methodName'] / as any to
  reach private members.
---

# Code Reuse Boundaries

写代码或重构时遵守以下复用边界。遇到「跨类要用同一段逻辑」时先读本 skill，再改代码。

## 原则（必须遵守）

1. **不能图省事而使用类似于方括号取私有方法的方式来绕过类的 private 限制，这个限制不应该被突破，如果真的需要使用，那么要将这个方法抽到公共的地方。**

2. **如果 2 个文件有需要复用同一个方法，那么禁止使用复制的方式，将方法原样拷贝一份到另一个文件，而应该抽取公共方法到 2 个文件的上层文件，然后 2 个文件引用同一个方法。**

## 禁止做法

| 禁止 | 示例 |
|------|------|
| 用字符串键 / 可选链绕过 `private` | `this.other['requireOwned']?.(…)` |
| 用类型断言绕过访问控制 | `(this.other as any).requireOwned(…)` / `@ts-expect-error` 强调 private |
| 复制粘贴同一方法到另一个文件 | `ServiceA` 与 `ServiceB` 各有一份几乎相同的 `assertOwned` |

## 正确做法

**跨类需要同一段逻辑时：**

1. 抽出到两个调用方的**上层共享位置**（同模块 `helpers/` / `utils/`、共享 service、或明确导出的 public API）。
2. 两边都**引用**这一处实现，不各写一份。
3. 原 `private` 方法：要么提升为共享 helper/public，要么只留在本类内部，**绝不**从外部偷调。

```typescript
// ❌ 绕过 private
await this.knowledgeBases['requireOwned']?.(userId, id);

// ❌ 复制粘贴
// file A & file B 各自 private async assertOwned(...) { ...相同实现... }

// ✅ 抽到上层，两边注入/import 同一处
await this.access.requireOwned(userId, id);
```

## 决策清单

改代码前自问：

- [ ] 是否在访问**另一个类**的 `private` / `protected`？→ 禁止绕过；应抽取或改为该方公开 API。
- [ ] 两个文件是否会出现**同一份方法体**？→ 禁止复制；先抽共享再引用。
- [ ] 新共享点是否落在**双方上层**（helper / 同模块公共层），而不是互相依赖对方的私有细节？

## 例外（很少）

- 框架/生成代码强制的反射等：**用户明确要求**且无法抽取时才可例外，并在代码旁注释原因。
- 「看起来像」但不相同的逻辑（参数、错误语义、副作用不同）：允许各自实现，或抽**参数化**公共函数；不要为了 DRY 硬揉成一份。
