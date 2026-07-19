# 网盘截图助手（浏览器扩展 · 试用原型）

阶段 C 联调版：框选网页 → 临时上传 → 问答/解题 → 存网盘或错题本。  
**可随时删除整个 `browser-extension/` 目录回滚**，不影响 Nest / Vue 主站（仅 `main.ts` 多了一段 CORS 放行 `chrome-extension://`）。

## 前置

1. Nest 已启动：`http://localhost:3000`
2. 使用**未开启 MFA** 的账号（试用版不处理 MFA）
3. Chrome / Edge

## 加载扩展

1. 打开 `chrome://extensions`（Edge：`edge://extensions`）
2. 开启**开发者模式**
3. **加载已解压的扩展程序** → 选择本目录  
   `FileManagement_proj/browser-extension`
4. 工具栏钉住「网盘截图助手」；点击图标打开 **Side Panel**

## 试用步骤

1. Side Panel 登录（API 默认 `http://localhost:3000`）
2. 打开任意普通网页（不要用 `chrome://` 页面）
3. 点 **框选网页区域** → 拖拽选区 → Esc 可取消
4. 选 **问答** 或 **解题** → 发送
5. **保存到网盘** 或 **存入错题本**，回 Web 端核对

## 目录

```text
browser-extension/
  manifest.json          # MV3
  background.js          # Side Panel + 截图编排
  content/               # 框选 overlay / 裁剪
  sidepanel/             # 登录 + 对话 + 保存 UI
  shared/                # API / 配置
  icons/
```

## 已知限制（原型）

- 无 MFA、无 refresh 自动续期
- 框选依赖可见区域截图，超长页未滚入视口的部分截不到
- CORS：后端已允许任意 `chrome-extension://`（仅本地联调；上架前应收紧为具体 extension id）
