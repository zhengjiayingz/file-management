# File Management Frontend

基于 Vue 3 + TypeScript + Vite + Element Plus 的文件管理系统前端。

## 🚀 快速启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 类型检查 (重要!)
pnpm type-check
```

## 📁 目录结构

```
src/
├── api/             # API 封装 (必须使用 types 定义)
├── assets/          # 静态资源
├── components/      # 通用组件
├── locales/         # i18n 国际化
├── router/          # 路由配置
├── stores/          # Pinia 状态管理
├── types/           # ⭐ TypeScript 类型定义中心
├── utils/           # 工具函数
└── views/           # 页面视图
```

## 📜 开发规范

本项目执行严格的 TypeScript 开发规范，请参考 `.agent/skills/frontend-development/SKILL.md`。

### 1. 类型定义
- 所有业务接口定义在 `src/types/` 下。
- **严禁**在组件内临时定义 `interface`。
- 参考 `src/types/user.ts` 或 `src/types/file.ts`。

### 2. API 调用
- 必须使用 `async/await`。
- 必须指定泛型返回值 `request.get<T>()`。
- 示例：
  ```typescript
  async getFiles(params: FileQueryParams): Promise<FileItem[]> {
      const res = await request.get<FileItem[]>('/files', { params })
      return res.data
  }
  ```

### 3. I18n 国际化
- 所有显示的文本必须使用 `t('key')`。
- 语言文件位于 `src/locales/`。

## 🛠️ 技术栈

- **Core**: Vue 3 (Composition API)
- **Language**: TypeScript 5.x
- **Build**: Vite 6.x
- **UI Lib**: Element Plus
- **State**: Pinia
- **CSS**: SCSS / CSS Variables
