---
name: API 文档助手
description: 帮助后端开发人员为 Express 路由添加标准化的 Swagger/OpenAPI 文档注释
---

# API 文档助手

## 概述
这个技能用于指导如何在编写或修改后端接口后，正确添加 Swagger (OpenAPI 3.0) 文档注释。这确保了我们的 API 文档始终与代码保持同步且格式统一。

## 使用场景
- 新增 API 接口后
- 修改现有接口参数或响应结构后
- 修复接口文档错误时

## 文档注释模板

请直接复制以下模板到路由处理函数上方，并根据实际情况修改：

### 1. 通用接口模板 (无需认证)

```typescript
/**
 * @swagger
 * /api/resource/path:
 *   get:
 *     summary: 接口简要描述
 *     tags: [资源分类]
 *     description: 详细描述（可选）
 *     parameters:
 *       - in: query
 *         name: paramName
 *         schema:
 *           type: string
 *         description: 参数描述
 *     responses:
 *       200:
 *         description: 成功响应描述
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/path', handler);
```

### 2. 需要认证的接口模板

```typescript
/**
 * @swagger
 * /api/resource/path:
 *   post:
 *     summary: 创建资源
 *     tags: [资源分类]
 *     security:
 *       - bearerAuth: []  # 关键：添加这行表示需要 JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: 名称
 *     responses:
 *       201:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResourceName'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/path', handler);
```

### 3. 文件上传接口模板

```typescript
/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: 上传文件
 *     tags: [文件管理]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 选择文件
 *     responses:
 *       200:
 *         description: 上传成功
 */
```

## 常用引用 (References)

为了保持文档简洁，请复用 `src/config/swagger.config.ts` 中定义的组件：

### 响应 (Responses)
- `400`: `$ref: '#/components/responses/ValidationError'` (参数错误)
- `401`: `$ref: '#/components/responses/UnauthorizedError'` (未登录/Token过期)
- `404`: `$ref: '#/components/responses/NotFoundError'` (资源不存在)

### 模型 (Schemas)
- 用户: `$ref: '#/components/schemas/User'`
- 文件: `$ref: '#/components/schemas/File'`
- 错误: `$ref: '#/components/schemas/Error'`

## 执行步骤

1.  **编写/修改代码**：完成路由处理函数的逻辑编写。
2.  **选择模板**：根据接口类型（GET/POST、是否需认证、是否传文件）选择上方合适的模板。
3.  **粘贴并修改**：
    - 将模板粘贴到 `router.method(...)` 之前。
    - 修改 **路径** (`/api/...`)、**方法** (`get/post`)。
    - 修改 **tags** (保持分类整洁)。
    - 定义 **requestBody** 或 **parameters**。
    - 定义 **responses**。
4.  **验证**：
    - 等待服务器热重载。
    - 访问 `http://localhost:3000/api-docs`。
    - 检查新接口是否出现，并测试调用是否正常。

## 最佳实践指南

1.  **Tag 分类**：尽量复用现有的 Tag（如 `认证`, `用户管理`, `文件管理`），避免 Tag 过于杂乱。
2.  **Schema 复用**：如果返回的是标准数据库对象，尽量引用 `components/schemas` 下的定义，而不是手动重写一遍属性。
3.  **示例数据**：在 Schema 中尽量添加 `example` 字段，这能让前端开发者看文档时更直观。
