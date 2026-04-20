# 文件管理系统业务流程文档

## 文档说明

本文档详细描述了文件管理系统各个功能模块的业务流程，包括每个步骤涉及的数据表操作。

**与需求文档对齐**：验收口径与权限/回收策略以 [REQUIREMENTS.md](./REQUIREMENTS.md) 为准。**2026-04-18**：§7.3 已改为「仅定时任务回收无引用物理文件」，废止原「管理员手动清理」流程描述；VIP 完整申请与审核见 REQUIREMENTS「VIP 升级与审核流程」及本节 **6.2** 说明。**2026-04-19**：补充 **§9.3** 个人信息与资料更新（弹窗 + `GET/PUT /api/user/profile`、`POST /api/user/avatar`），与 REQUIREMENTS「其他需求」（3）（4）一致。**2026-04-20**：与 §5(2) 对齐——**Token 强失效**采用 **`users.session_version` + JWT `sv`** 与 **Refresh `is_revoked`**；**不**实现逐枚 Access（`jti`）黑名单；管理员踢会话见 **§7.1**。**2026-04-20（§3）**：链接分享 **访问人数上限** `max_visitors`（创建时可选 1～10 或不限）：**未登录**打开列表/下载按 **IP** 计数；**转存须登录**，仅按 **用户 ID** 计数（无匿名转存）；实现见 `share.controller.ts` `ensureVisitorAllowedInTx`；`share_access_logs.action` 含 `view` / `download` / `save`。**工程**：Prisma Client 生成与 Windows 环境问题见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

---

## 目录

1. [用户认证流程](#1-用户认证流程)
2. [文件管理流程](#2-文件管理流程)
3. [文件分享流程](#3-文件分享流程)
4. [好友系统流程](#4-好友系统流程)
5. [消息系统流程](#5-消息系统流程)
6. [存储管理流程](#6-存储管理流程)
7. [管理员功能流程](#7-管理员功能流程)
8. [定时任务流程](#8-定时任务流程)
9. [用户设置流程](#9-用户设置流程)（含 [9.3 个人信息与资料更新](#93-个人信息与资料更新头像--邮箱)）

---

## 1. 用户认证流程

### 1.1 用户注册流程

**流程步骤：**

1. **前端验证**
   - 验证用户名格式（唯一性）
   - 验证密码强度（8位以上，包含数字/字母/大小写/特殊字符至少3种）
   - 验证邮箱格式

2. **后端处理**
   - 检查用户名是否已存在
   - 检查邮箱是否已注册
   - 密码 SHA256 加密
   - 创建用户记录（`users` 表：`must_change_password`、`avatar_url`、`vip_expire_at` 等由数据库/Prisma 默认值填充，与 [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) §3.1 一致）

3. **初始化配置**
   - 设置默认存储配额（普通用户 1GB）
   - 初始化已使用存储为 0
   - 设置用户状态为 active

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 检查用户名/邮箱是否存在 |
| users | INSERT | 创建新用户记录 |

**SQL 示例：**
```sql
-- 检查用户名是否存在
SELECT id FROM users WHERE username = ?

-- 创建用户
INSERT INTO users (username, password, email, role, storage_quota, storage_used, status)
VALUES (?, ?, ?, 'user', 1073741824, 0, 'active')
```

---

### 1.2 用户登录流程（双Token）

**流程步骤：**

1. **用户提交登录信息**
   - 用户名/邮箱 + 密码

2. **验证用户身份**
   - 查询用户记录
   - 验证密码（SHA256）
   - 检查账户状态

3. **生成双Token**
   - 生成 Access Token（JWT，15 分钟有效，载荷含 **`sv`** = 当前 `users.session_version`）
   - 生成 Refresh Token（随机字符串，7 天有效）

4. **存储 Refresh Token**
   - 保存到 refresh_tokens 表
   - 记录设备信息、IP 地址

5. **（实现）清空踢人展示标记**
   - 登录事务内 `users.last_session_kick_at = NULL`

6. **记录登录日志**
   - 保存登录记录到 login_logs 表

7. **返回Token**
   - 返回 Access Token 和 Refresh Token 给前端

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT / UPDATE | 验证密码；登录成功可更新 `last_session_kick_at` |
| refresh_tokens | INSERT | 存储 Refresh Token |
| login_logs | INSERT | 记录登录日志 |

**SQL 示例：**
```sql
-- 验证用户
SELECT id, username, password, role, status FROM users 
WHERE username = ? AND status = 'active'

-- 存储 Refresh Token
INSERT INTO refresh_tokens (user_id, token, device_name, device_type, ip_address, user_agent, expires_at)
VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))

-- 记录登录日志
INSERT INTO login_logs (user_id, ip_address, device, user_agent, status)
VALUES (?, ?, ?, ?, 'success')
```

---

### 1.3 Token 刷新流程

**流程步骤：**

1. **Access Token 过期**
   - 前端收到 401 状态码

2. **请求刷新Token**
   - 携带 Refresh Token 请求刷新接口

3. **验证 Refresh Token**
   - 查询 refresh_tokens 表
   - 检查是否存在
   - 检查是否已撤销（is_revoked）
   - 检查是否过期（expires_at）

4. **生成新的 Access Token**
   - 生成新的 JWT（载荷 **`sv`** 与当前 `users.session_version` 一致）

5. **更新使用时间**
   - 更新 last_used_at 字段

6. **返回新Token**
   - 返回新的 Access Token

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| refresh_tokens | SELECT | 验证 Refresh Token |
| refresh_tokens | UPDATE | 更新最后使用时间 |

**SQL 示例：**
```sql
-- 验证 Refresh Token
SELECT user_id, is_revoked, expires_at FROM refresh_tokens
WHERE token = ? AND is_revoked = FALSE AND expires_at > NOW()

-- 更新使用时间
UPDATE refresh_tokens SET last_used_at = NOW() WHERE token = ?
```

---

### 1.4 用户登出流程

**流程步骤：**

1. **用户请求登出**
   - 携带 Refresh Token

2. **撤销 Refresh Token**
   - 将 is_revoked 设置为 TRUE

3. **清除前端Token**
   - 前端清除所有存储的 Token

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| refresh_tokens | UPDATE | 撤销 Refresh Token |

**SQL 示例：**
```sql
-- 撤销 Token
UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = ?
```

---

### 1.5 Token 强失效（会话版本，与需求 §5(2) 一致）

**说明**：需求中的「黑名单」验收为 **Refresh 表内撤销** + **Access 与 `session_version`/`sv` 绑定**；**不**引入逐枚 Access（`jti`/Redis）存储。

**API / Socket 校验（摘要）：**

1. `jwt.verify` 成功后读取载荷中的 **`sv`**（旧 token 可无该字段，按 **0** 与库比较）。
2. 查询 `users.session_version`，若 **`sv` ≠ `session_version`** → **401**（如 `code: SESSION_REVOKED`），前端应登出并引导重新登录。
3. Socket.IO 握手使用同一 JWT 规则。

**会使 `session_version` 递增的典型场景**（与实现对齐）：用户修改密码；管理员禁用用户、重置密码、**踢出会话**；等。

**涉及的表：** `users`（`session_version`、`last_session_kick_at`）；`refresh_tokens`（批量 `is_revoked`，视场景而定）。

---

### 1.6 多设备会话管理流程

> **产品状态（§5(7)）**：终端用户侧「会话列表 + 按设备撤销」**尚未**作为完整功能交付；管理员看板已支持 **踢出指定用户全部会话**（见 **§7.1.3**）。本节描述可作为后续扩展的表级操作参考。

**流程步骤：**

#### 1.6.1 查看所有活跃会话

1. **查询用户的所有未撤销Token**
   - 查询 refresh_tokens 表
   - 筛选 is_revoked = FALSE 且未过期的记录

2. **返回设备列表**
   - 设备名称、设备类型
   - 登录时间、最后使用时间
   - IP地址、地理位置

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| refresh_tokens | SELECT | 查询所有活跃会话 |

**SQL 示例：**
```sql
-- 查询所有活跃会话
SELECT id, device_name, device_type, ip_address, 
       created_at as login_time, last_used_at, expires_at
FROM refresh_tokens
WHERE user_id = ? AND is_revoked = FALSE AND expires_at > NOW()
ORDER BY last_used_at DESC
```

#### 1.6.2 远程登出指定设备

1. **验证会话所有权**
   - 检查 token 是否属于当前用户

2. **撤销指定设备的 Token**
   - 设置 is_revoked = TRUE

3. **记录操作日志**
   - 记录远程登出操作

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| refresh_tokens | SELECT | 验证会话所有权 |
| refresh_tokens | UPDATE | 撤销指定Token |
| operation_logs | INSERT | 记录操作日志 |

**SQL 示例：**
```sql
-- 验证会话所有权
SELECT id FROM refresh_tokens WHERE id = ? AND user_id = ?

-- 撤销指定设备的Token
UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = ? AND user_id = ?

-- 记录操作日志
INSERT INTO operation_logs (user_id, operation_type, resource_type, resource_id, description, ip_address)
VALUES (?, 'remote_logout', 'session', ?, '远程登出设备', ?)
```

#### 1.6.3 登出所有其他设备

1. **撤销除当前设备外的所有 Token**
   - 保留当前使用的 token
   - 撤销其他所有 token

2. **记录操作日志**

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| refresh_tokens | UPDATE | 撤销其他设备的Token |
| operation_logs | INSERT | 记录操作日志 |

**SQL 示例：**
```sql
-- 撤销除当前设备外的所有Token
UPDATE refresh_tokens 
SET is_revoked = TRUE 
WHERE user_id = ? AND token != ? AND is_revoked = FALSE

-- 记录操作日志
INSERT INTO operation_logs (user_id, operation_type, resource_type, description, ip_address)
VALUES (?, 'logout_all_devices', 'session', '登出所有其他设备', ?)
```

---

### 1.7 修改密码流程

**流程步骤：**

1. **验证原密码**（强制改密场景可免填当前密码，以实现为准）
   - 查询用户记录
   - 验证原密码正确性

2. **更新密码**
   - 新密码 SHA256 加密
   - 更新 `users` 表，**`session_version = session_version + 1`**（旧 Access 全部作废）

3. **Refresh Token（以实现为准）**
   - 当前实现**不**批量撤销 Refresh；客户端可用 Refresh 换取带新 `sv` 的 Access

4. **返回新 Access Token**（载荷 `sv` 已更新）

5. **（可选）记录操作日志**

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 验证原密码 |
| users | UPDATE | 更新新密码并递增 `session_version` |
| operation_logs | INSERT | 可选，记录密码修改 |

**SQL 示例（逻辑示意）：**
```sql
-- 验证原密码
SELECT password, session_version FROM users WHERE id = ?

-- 更新密码并递增会话版本
UPDATE users SET password = ?, session_version = session_version + 1, updated_at = NOW() WHERE id = ?
```

---

## 2. 文件管理流程

### 2.1 文件上传流程（分片上传 + 秒传）

**流程步骤：**

1. **前端计算文件MD5**
   - 计算完整文件的 MD5 哈希值（file_hash）

2. **秒传检测**
   - 请求后端检查 file_hash 是否已存在

3. **情况A：文件已存在（秒传）**
   - 查询 file_storage 表，找到已存在的文件
   - 直接创建 user_files 记录（引用已存在的文件）
   - file_storage.reference_count + 1
   - 更新用户 storage_used
   - 记录操作日志
   - **流程结束**

4. **情况B：文件不存在（分片上传）**
   
   a. **开始分片上传**
   - 前端将文件分片（如每片 5MB）
   - 计算每个分片的 MD5

   b. **上传分片**
   - 逐个上传分片到服务器
   - 创建 upload_chunks 记录
   - 保存分片文件到临时目录

   c. **断点续传支持**
   - 查询已上传的分片
   - 跳过已上传的分片，继续上传剩余分片

   d. **合并分片**
   - 所有分片上传完成后
   - 后端按顺序合并分片
   - 验证合并后文件的 MD5

   e. **创建文件记录**
   - 创建 file_storage 记录（reference_count = 1）
   - 创建 user_files 记录
   - 更新用户 storage_used
   - 删除临时分片文件
   - 删除 upload_chunks 记录
   - 记录操作日志

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_storage | SELECT | 检查文件是否已存在（秒传） |
| file_storage | UPDATE | 更新引用计数（秒传） |
| file_storage | INSERT | 创建物理文件记录（新上传） |
| user_files | INSERT | 创建用户文件引用 |
| upload_chunks | INSERT | 记录分片上传进度 |
| upload_chunks | SELECT | 查询已上传分片（断点续传） |
| upload_chunks | DELETE | 上传完成后清理记录 |
| users | UPDATE | 更新已使用存储空间 |
| operation_logs | INSERT | 记录上传操作 |

**SQL 示例：**
```sql
-- 秒传检测
SELECT id, file_size FROM file_storage WHERE file_hash = ? AND status = 'active'

-- 秒传：更新引用计数
UPDATE file_storage SET reference_count = reference_count + 1 WHERE id = ?

-- 秒传：创建用户文件引用
INSERT INTO user_files (user_id, storage_id, parent_id, file_name, file_type)
VALUES (?, ?, ?, ?, 'file')

-- 分片上传：记录分片
INSERT INTO upload_chunks (user_id, file_hash, chunk_index, chunk_hash, chunk_size, chunk_path, status)
VALUES (?, ?, ?, ?, ?, ?, 'completed')

-- 查询已上传分片（断点续传）
SELECT chunk_index FROM upload_chunks 
WHERE user_id = ? AND file_hash = ? AND status = 'completed'

-- 创建物理文件记录
INSERT INTO file_storage (file_hash, file_path, file_size, mime_type, reference_count, status)
VALUES (?, ?, ?, ?, 1, 'active')

-- 更新用户存储
UPDATE users SET storage_used = storage_used + ? WHERE id = ?

-- 清理分片记录
DELETE FROM upload_chunks WHERE user_id = ? AND file_hash = ?
```

---

### 2.2 文件下载流程

**流程步骤：**

1. **验证权限**
   - 检查用户是否有权限访问该文件
   - 查询 user_files 表

2. **获取物理文件路径**
   - 通过 storage_id 查询 file_storage 表
   - 获取 file_path

3. **生成下载链接/流式传输**
   - 返回文件流给前端

4. **记录下载日志**
   - 记录到 operation_logs 表

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 验证文件所有权 |
| file_storage | SELECT | 获取物理文件路径 |
| operation_logs | INSERT | 记录下载操作 |

**SQL 示例：**
```sql
-- 验证权限并获取文件信息
SELECT uf.id, uf.file_name, fs.file_path, fs.file_size, fs.mime_type
FROM user_files uf
JOIN file_storage fs ON uf.storage_id = fs.id
WHERE uf.id = ? AND uf.user_id = ? AND uf.is_deleted = FALSE

-- 记录下载日志
INSERT INTO operation_logs (user_id, operation_type, resource_type, resource_id, description, ip_address)
VALUES (?, 'download', 'file', ?, '下载文件', ?)
```

---

### 2.3 文件删除流程（软删除 + 延迟物理删除）

**流程步骤：**

1. **用户删除文件（移入回收站）**
   - 设置 user_files.is_deleted = TRUE
   - 记录 deleted_at 时间
   - 记录操作日志

2. **回收站恢复**
   - 设置 user_files.is_deleted = FALSE
   - 清空 deleted_at

3. **彻底删除**
   
   a. **删除用户文件引用**
   - 删除 user_files 记录
   
   b. **更新物理文件引用计数**
   - file_storage.reference_count - 1
   
   c. **检查引用计数**
   - 如果 reference_count = 0
   - 设置 status = 'pending_delete'
   - 记录 marked_delete_at = NOW()
   
   d. **更新用户存储**
   - users.storage_used - file_size

4. **定时任务：物理删除文件**
   - 定时扫描 file_storage 表
   - 查找 status = 'pending_delete' 且 marked_delete_at + 24小时 < NOW()
   - 删除物理文件
   - 删除 file_storage 记录

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | UPDATE | 软删除（移入回收站） |
| user_files | UPDATE | 恢复文件 |
| user_files | DELETE | 彻底删除用户文件引用 |
| file_storage | UPDATE | 更新引用计数 |
| file_storage | UPDATE | 标记为待删除 |
| file_storage | DELETE | 物理删除文件记录 |
| users | UPDATE | 更新已使用存储 |
| operation_logs | INSERT | 记录删除操作 |

**SQL 示例：**
```sql
-- 软删除（移入回收站）
UPDATE user_files SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ? AND user_id = ?

-- 恢复文件
UPDATE user_files SET is_deleted = FALSE, deleted_at = NULL WHERE id = ? AND user_id = ?

-- 彻底删除：删除用户文件引用
DELETE FROM user_files WHERE id = ? AND user_id = ?

-- 彻底删除：更新引用计数
UPDATE file_storage SET reference_count = reference_count - 1 WHERE id = ?

-- 彻底删除：标记为待删除
UPDATE file_storage 
SET status = 'pending_delete', marked_delete_at = NOW() 
WHERE id = ? AND reference_count = 0

-- 更新用户存储
UPDATE users SET storage_used = storage_used - ? WHERE id = ?

-- 定时任务：查找待删除文件
SELECT id, file_path FROM file_storage
WHERE status = 'pending_delete' 
AND marked_delete_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)

-- 定时任务：删除文件记录
DELETE FROM file_storage WHERE id = ?
```

---

### 2.4 文件夹管理流程

**流程步骤：**

#### 2.4.1 创建文件夹

1. **创建文件夹记录**
   - 在 user_files 表创建记录
   - file_type = 'folder'
   - storage_id = NULL
   - parent_id = 父文件夹ID（根目录为NULL）

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | INSERT | 创建文件夹记录 |

**SQL 示例：**
```sql
-- 创建文件夹
INSERT INTO user_files (user_id, parent_id, file_name, file_type)
VALUES (?, ?, ?, 'folder')
```

#### 2.4.2 移动文件/文件夹

1. **验证目标文件夹**
   - 检查目标文件夹是否存在
   - 检查是否是自己的子文件夹（防止循环引用）

2. **更新 parent_id**
   - 修改文件/文件夹的 parent_id

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 验证目标文件夹 |
| user_files | UPDATE | 更新父文件夹ID |

**SQL 示例：**
```sql
-- 验证目标文件夹
SELECT id FROM user_files 
WHERE id = ? AND user_id = ? AND file_type = 'folder' AND is_deleted = FALSE

-- 移动文件
UPDATE user_files SET parent_id = ? WHERE id = ? AND user_id = ?
```

#### 2.4.3 重命名文件/文件夹

1. **更新文件名**
   - 修改 file_name 字段

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | UPDATE | 更新文件名 |

**SQL 示例：**
```sql
-- 重命名
UPDATE user_files SET file_name = ?, updated_at = NOW() 
WHERE id = ? AND user_id = ?
```

---

### 2.5 文件搜索流程

**流程步骤：**

1. **构建搜索条件**
   - 文件名模糊匹配
   - 文件类型筛选
   - 上传时间范围

2. **查询用户文件**
   - 查询 user_files 表
   - 只查询未删除的文件

3. **返回搜索结果**
   - 包含文件信息和文件夹路径

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 搜索文件 |
| file_storage | SELECT | 获取文件详细信息 |

**SQL 示例：**
```sql
-- 搜索文件
SELECT uf.id, uf.file_name, uf.file_type, uf.created_at, fs.file_size, fs.mime_type
FROM user_files uf
LEFT JOIN file_storage fs ON uf.storage_id = fs.id
WHERE uf.user_id = ? 
AND uf.is_deleted = FALSE
AND uf.file_name LIKE ?
AND uf.created_at BETWEEN ? AND ?
ORDER BY uf.created_at DESC
```

---

### 2.6 文件标签管理流程

**流程步骤：**

#### 2.6.1 创建标签

1. **创建标签记录**
   - 在 file_tags 表创建标签

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_tags | INSERT | 创建标签 |

**SQL 示例：**
```sql
-- 创建标签
INSERT INTO file_tags (user_id, tag_name, color)
VALUES (?, ?, ?)
```

#### 2.6.2 给文件添加标签

1. **创建关联记录**
   - 在 user_file_tags 表创建关联

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_file_tags | INSERT | 关联文件和标签 |

**SQL 示例：**
```sql
-- 添加标签
INSERT INTO user_file_tags (user_file_id, tag_id)
VALUES (?, ?)
```

#### 2.6.3 按标签筛选文件

1. **查询带标签的文件**
   - 通过 user_file_tags 关联查询

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 查询文件 |
| user_file_tags | SELECT | 标签关联 |
| file_tags | SELECT | 标签信息 |

**SQL 示例：**
```sql
-- 按标签查询文件
SELECT uf.*, ft.tag_name, ft.color
FROM user_files uf
JOIN user_file_tags uft ON uf.id = uft.user_file_id
JOIN file_tags ft ON uft.tag_id = ft.id
WHERE uf.user_id = ? AND ft.id = ? AND uf.is_deleted = FALSE
```

---

### 2.7 文件版本管理流程

**流程步骤：**

#### 2.7.1 版本更新（上传同名文件）

1. **上传文件**
   - 用户选择上传文件，前端检测到同名文件
   - 用户确认“保存新版本”

2. **归档旧版本**
   - 将当前 `user_files` 记录复制到 `file_histories`
   - 记录 version = current_version

3. **更新主文件**
   - 更新 `user_files` 为新文件的 storage_id, file_size
   - version = current_version + 1

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 获取当前文件信息 |
| file_histories | INSERT | 归档旧版本 |
| user_files | UPDATE | 更新新版本信息 |

**SQL 示例：**
```sql
-- 1. 获取当前文件信息
SELECT * FROM user_files WHERE id = ?;

-- 2. 归档旧版本
INSERT INTO file_histories (user_file_id, storage_id, file_name, file_size, version)
VALUES (?, ?, ?, ?, ?);

-- 3. 更新新版本
UPDATE user_files 
SET storage_id = ?, file_size = ?, version = version + 1 
WHERE id = ?;
```

#### 2.7.2 版本回滚

1. **选择版本**
   - 用户在历史列表选择某个版本

2. **归档当前版本**
   - 将当前状态再次归档到 `file_histories`

3. **恢复旧版本**
   - 从 `file_histories` 获取旧版本的 storage_id, file_size
   - 更新 `user_files`
   - version + 1 (确保版本号递增)

**SQL 示例：**
```sql
-- 1. 获取选中的历史版本
SELECT storage_id, file_size FROM file_histories WHERE id = ?;

-- 2. 归档当前
INSERT INTO file_histories ... (同上)

-- 3. 覆盖回 user_files
UPDATE user_files
SET storage_id = ?, file_size = ?, version = version + 1
WHERE id = ?;
```

#### 2.7.3 查看/预览历史版本

1. **获取版本列表**
   - 查询 file_histories 表
   - 按 version 倒序排列

2. **预览/下载历史版本**
   - 用户双击历史记录
   - 后端通过 version_id 和 user_file_id 验证权限
   - 返回物理文件流（支持 inline 预览或 attachment 下载）

**SQL 示例：**
```sql
-- 获取版本列表
SELECT id, version, file_name, file_size, created_at 
FROM file_histories 
WHERE user_file_id = ? 
ORDER BY version DESC;

-- 获取特定版本文件信息
SELECT fh.id, fs.file_path, fs.mime_type
FROM file_histories fh
JOIN file_storage fs ON fh.storage_id = fs.id
WHERE fh.id = ? AND fh.user_file_id = ?;
```

---

## 3. 文件分享流程

### 3.1 创建分享链接流程

**流程步骤：**

1. **验证文件权限**
   - 检查用户是否拥有该文件

2. **生成分享信息**
   - 生成唯一的 share_code（实现为 16 位十六进制等，见后端 `genShareCode`）
   - 如果是私密分享，生成 extract_code（4 位字母数字，见后端）
   - `permission` 以 **`download`** 向与 [REQUIREMENTS.md](./REQUIREMENTS.md) §3（3）一致；**不**做「仅查看 / 可编辑」分档
   - 设置过期时间（`validity` 映射 `expire_at`）
   - 可选 **访问人数上限** `max_visitors`：1～10 或 `NULL` 不限制

3. **创建分享记录**
   - 在 `file_shares` 表创建记录（含 `max_visitors`、`user_file_ids` 等，与 [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) 一致）

4. **返回分享链接**
   - 返回分享码和提取码

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 验证文件所有权 |
| file_shares | INSERT | 创建分享记录 |
| operation_logs | INSERT | 记录分享操作 |

**SQL 示例：**
```sql
-- 验证文件所有权
SELECT id FROM user_files WHERE id = ? AND user_id = ? AND is_deleted = FALSE

-- 创建分享
INSERT INTO file_shares (user_id, user_file_id, share_code, extract_code, permission, expire_at, status)
VALUES (?, ?, ?, ?, ?, ?, 'active')

-- 记录操作
INSERT INTO operation_logs (user_id, operation_type, resource_type, resource_id, description, ip_address)
VALUES (?, 'share', 'file', ?, '创建分享链接', ?)
```

---

### 3.2 访问分享链接流程

**流程步骤：**

1. **验证分享链接**
   - 通过 share_code 查询 file_shares 表
   - 检查分享状态（status = 'active'）
   - 检查是否过期（expire_at）

2. **验证提取码（私密分享）**
   - 如果有 extract_code，验证用户输入的提取码

3. **访问人数上限（若 `max_visitors` 非空）**
   - 在事务内对 `file_shares` 行加锁（`SELECT … FOR UPDATE`），按 **未登录访客** 统计：`share_access_logs` 中 `visitor_id IS NULL` 的 **独立 IP** 数；若当前 IP 已出现过则放行；否则若已达上限则返回 403（与 `ensureVisitorAllowedInTx` 一致）

4. **事务内更新统计并写访问日志**
   - 人数校验通过后：`view_count + 1`，`share_access_logs` 插入 `action = 'view'`（`visitor_id` 一般为 NULL；与步骤 3 同一事务）

5. **查询并返回文件列表**
   - 查询 `user_files` / `storage`，返回列表 JSON（与后端 `accessPublicShare` 一致）

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_shares | SELECT | 验证分享链接 |
| file_shares | UPDATE | 更新访问统计 |
| user_files | SELECT | 获取文件信息 |
| file_storage | SELECT | 获取物理文件信息 |
| share_access_logs | INSERT | 记录访问日志 |

**SQL 示例：**
```sql
-- 验证分享链接
SELECT id, user_file_id, extract_code, permission, expire_at, status
FROM file_shares
WHERE share_code = ? 
AND status = 'active'
AND (expire_at IS NULL OR expire_at > NOW())

-- 更新访问统计
UPDATE file_shares SET view_count = view_count + 1 WHERE id = ?

-- 获取文件信息
SELECT uf.file_name, fs.file_size, fs.mime_type, fs.file_path
FROM user_files uf
JOIN file_storage fs ON uf.storage_id = fs.id
WHERE uf.id = ?

-- 记录访问日志
INSERT INTO share_access_logs (share_id, visitor_id, ip_address, user_agent, action)
VALUES (?, ?, ?, ?, 'view')
```

---

### 3.3 下载分享文件流程

**流程步骤：**

1. **验证分享权限**
   - 校验分享码、未过期、`extract_code`（查询参数或 URL）等（与访问列表一致）

2. **访问人数上限（若 `max_visitors` 非空）**
   - 与 **3.2** 相同规则：未登录按 **IP** 计数；在写入响应体/文件流**之前**完成事务内校验（避免 403 时已设置下载响应头）

3. **获取文件**
   - 返回文件流

4. **更新下载统计与日志（与上一步同事务）**
   - `download_count + 1`
   - `share_access_logs` 插入 `action = 'download'`

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_shares | SELECT | 验证下载权限 |
| file_shares | UPDATE | 更新下载统计 |
| share_access_logs | INSERT | 记录下载日志 |

**SQL 示例：**
```sql
-- 验证下载权限
SELECT permission FROM file_shares WHERE id = ? AND permission IN ('download', 'edit')

-- 更新下载统计
UPDATE file_shares SET download_count = download_count + 1 WHERE id = ?

-- 记录下载日志
INSERT INTO share_access_logs (share_id, visitor_id, ip_address, user_agent, action)
VALUES (?, ?, ?, ?, 'download')
```

---

### 3.4 转存分享文件到个人网盘（须登录）

**说明**：转存**无匿名路径**，须先登录再调用接口。

**流程步骤：**

1. **认证**
   - 请求携带 Bearer Token（`AuthRequest`）

2. **校验分享与文件**
   - `POST /api/files/:id/save-to-my-drive`（见 `file.routes.ts` `saveSharedFile`）
   - Body：`shareCode`、`extractCode`、`parentId` 等；校验文件属于该分享、提取码正确（`verifySharedFileForSave`）

3. **访问人数上限（若 `max_visitors` 非空）**
   - 在**同一事务**内（与容量、引用计数、`user_files` 插入）：对 `file_shares` 行加锁；仅统计 `share_access_logs` 中 **`visitor_id` 非空** 的**不同用户 ID** 数（与未登录 IP **分开计数**）；当前用户已存在则放行；否则若已达上限则 403

4. **落库**
   - 写入 `share_access_logs`：`action = 'save'`，`visitor_id` = 当前用户
   - 更新用户已用容量、源 `file_storage.reference_count`、新建 `user_files` 引用同一存储（与业务实现一致）

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_shares | SELECT / 行锁 | 校验分享、`max_visitors` |
| share_access_logs | INSERT | `action = save`，`visitor_id` 必填 |
| users / file_storage / user_files | UPDATE / INSERT | 容量与引用、新文件行 |

---

### 3.5 取消分享流程

**流程步骤：**

1. **验证所有权**
   - 检查分享是否属于当前用户

2. **更新分享状态**
   - 设置 status = 'cancelled'

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_shares | SELECT | 验证所有权 |
| file_shares | UPDATE | 取消分享 |

**SQL 示例：**
```sql
-- 验证所有权
SELECT id FROM file_shares WHERE id = ? AND user_id = ?

-- 取消分享
UPDATE file_shares SET status = 'cancelled' WHERE id = ?
```

---

## 4. 好友系统流程

### 4.1 添加好友流程

**流程步骤：**

1. **发送好友请求**
   - 用户A向用户B发送好友请求
   - 创建 friendships 记录
   - status = 'pending'

2. **通知对方**
   - 可以通过消息系统通知用户B

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 验证目标用户存在 |
| friendships | SELECT | 检查是否已经是好友 |
| friendships | INSERT | 创建好友请求 |

**SQL 示例：**
```sql
-- 验证目标用户
SELECT id FROM users WHERE id = ? AND status = 'active'

-- 检查是否已经是好友
SELECT id FROM friendships 
WHERE user_id = ? AND friend_id = ? AND status IN ('pending', 'accepted')

-- 创建好友请求
INSERT INTO friendships (user_id, friend_id, status)
VALUES (?, ?, 'pending')
```

---

### 4.2 处理好友请求流程

**流程步骤：**

#### 4.2.1 接受好友请求

1. **更新请求状态**
   - 将 status 更新为 'accepted'

2. **创建反向关系**
   - 创建另一条记录（friend_id → user_id）
   - 实现双向好友关系

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| friendships | UPDATE | 接受好友请求 |
| friendships | INSERT | 创建反向关系 |

**SQL 示例：**
```sql
-- 接受好友请求
UPDATE friendships SET status = 'accepted', updated_at = NOW()
WHERE user_id = ? AND friend_id = ? AND status = 'pending'

-- 创建反向关系
INSERT INTO friendships (user_id, friend_id, status)
VALUES (?, ?, 'accepted')
```

#### 4.2.2 拒绝好友请求

1. **更新请求状态**
   - 将 status 更新为 'rejected'

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| friendships | UPDATE | 拒绝好友请求 |

**SQL 示例：**
```sql
-- 拒绝好友请求
UPDATE friendships SET status = 'rejected', updated_at = NOW()
WHERE user_id = ? AND friend_id = ? AND status = 'pending'
```

---

### 4.3 查看好友列表流程

**流程步骤：**

1. **查询好友关系**
   - 查询 status = 'accepted' 的记录

2. **获取好友信息**
   - 关联 users 表获取好友详细信息

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| friendships | SELECT | 查询好友关系 |
| users | SELECT | 获取好友信息 |

**SQL 示例：**
```sql
-- 查询好友列表
SELECT u.id, u.username, u.email, f.created_at as friend_since
FROM friendships f
JOIN users u ON f.friend_id = u.id
WHERE f.user_id = ? AND f.status = 'accepted'
ORDER BY f.created_at DESC
```

---

### 4.4 删除好友流程

**流程步骤：**

1. **删除双向关系**
   - 删除两条 friendships 记录

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| friendships | DELETE | 删除好友关系 |

**SQL 示例：**
```sql
-- 删除好友关系（双向）
DELETE FROM friendships 
WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
```

---

## 5. 消息系统流程

### 5.1 发送消息流程

**流程步骤：**

#### 5.1.1 发送文本消息

1. **验证好友关系**
   - 检查是否是好友

2. **创建消息记录**
   - 在 messages 表创建记录
   - message_type = 'text'
   - is_read = FALSE

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| friendships | SELECT | 验证好友关系 |
| messages | INSERT | 创建消息记录 |

**SQL 示例：**
```sql
-- 验证好友关系
SELECT id FROM friendships 
WHERE user_id = ? AND friend_id = ? AND status = 'accepted'

-- 创建消息
INSERT INTO messages (sender_id, receiver_id, content, message_type, is_read)
VALUES (?, ?, ?, 'text', FALSE)
```

#### 5.1.2 发送文件消息

1. **验证好友关系**
   - 检查是否是好友

2. **验证文件权限**
   - 检查文件是否属于发送者

3. **创建消息记录**
   - message_type = 'file'
   - file_id = 文件ID

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| friendships | SELECT | 验证好友关系 |
| user_files | SELECT | 验证文件所有权 |
| messages | INSERT | 创建文件消息 |

**SQL 示例：**
```sql
-- 验证文件所有权
SELECT id FROM user_files WHERE id = ? AND user_id = ? AND is_deleted = FALSE

-- 创建文件消息
INSERT INTO messages (sender_id, receiver_id, content, message_type, file_id, is_read)
VALUES (?, ?, ?, 'file', ?, FALSE)
```

---

### 5.2 接收消息流程

**流程步骤：**

1. **查询未读消息**
   - 查询 receiver_id = 当前用户 且 is_read = FALSE

2. **获取消息详情**
   - 如果是文件消息，关联查询文件信息

3. **返回消息列表**

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| messages | SELECT | 查询消息 |
| users | SELECT | 获取发送者信息 |
| user_files | SELECT | 获取文件信息（文件消息） |

**SQL 示例：**
```sql
-- 查询未读消息
SELECT m.*, u.username as sender_name, uf.file_name
FROM messages m
JOIN users u ON m.sender_id = u.id
LEFT JOIN user_files uf ON m.file_id = uf.id
WHERE m.receiver_id = ? AND m.is_read = FALSE
ORDER BY m.created_at DESC
```

---

### 5.3 标记消息已读流程

**流程步骤：**

1. **更新消息状态**
   - 设置 is_read = TRUE
   - 记录 read_at 时间

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| messages | UPDATE | 标记已读 |

**SQL 示例：**
```sql
-- 标记单条消息已读
UPDATE messages SET is_read = TRUE, read_at = NOW()
WHERE id = ? AND receiver_id = ?

-- 标记所有消息已读
UPDATE messages SET is_read = TRUE, read_at = NOW()
WHERE receiver_id = ? AND is_read = FALSE
```

---

### 5.4 查看聊天记录流程

**流程步骤：**

1. **查询双向消息**
   - 查询发送者和接收者之间的所有消息

2. **按时间排序**
   - 返回聊天记录

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| messages | SELECT | 查询聊天记录 |

**SQL 示例：**
```sql
-- 查询聊天记录
SELECT * FROM messages
WHERE (sender_id = ? AND receiver_id = ?) 
   OR (sender_id = ? AND receiver_id = ?)
ORDER BY created_at ASC
LIMIT 50
```

---

## 6. 存储管理流程

### 6.1 查询存储使用情况流程

**流程步骤：**

1. **查询用户信息**
   - 获取 storage_quota 和 storage_used

2. **计算使用百分比**
   - 百分比 = (storage_used / storage_quota) * 100

3. **返回存储信息**

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 查询存储信息 |

**SQL 示例：**
```sql
-- 查询存储使用情况
SELECT storage_quota, storage_used, 
       ROUND((storage_used / storage_quota) * 100, 2) as usage_percentage
FROM users
WHERE id = ?
```

---

### 6.2 升级VIP流程

**产品说明**：用户侧先提交 **VIP 升级申请**，管理员在「通讯录 → VIP申请」或会话内对 `[VIP升级申请]` 消息操作 **同意/拒绝**；**同意**后后端对申请人执行与本节一致的落库（角色、配额等）。完整交互见 [REQUIREMENTS.md](./REQUIREMENTS.md)「VIP 升级与审核流程」。以下对应 **审核通过之后** 的数据更新步骤（若实现中含 `vip_expire_at` 等字段，以实现为准）。

**流程步骤：**

1. **验证用户状态**
   - 检查用户是否已经是VIP

2. **更新用户角色**
   - 设置 role = 'vip'
   - 更新 storage_quota = 2GB
   - 设置 vip_expire_at（如果有期限）

3. **记录操作日志**

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 验证用户状态 |
| users | UPDATE | 升级为VIP |
| operation_logs | INSERT | 记录升级操作 |

**SQL 示例：**
```sql
-- 验证用户状态
SELECT role FROM users WHERE id = ?

-- 升级为VIP
UPDATE users 
SET role = 'vip', 
    storage_quota = 2147483648,
    vip_expire_at = DATE_ADD(NOW(), INTERVAL 1 YEAR),
    updated_at = NOW()
WHERE id = ?

-- 记录操作
INSERT INTO operation_logs (user_id, operation_type, resource_type, description, ip_address)
VALUES (?, 'upgrade_vip', 'user', '升级为VIP用户', ?)
```

---

### 6.3 存储空间计算流程

**流程步骤：**

1. **计算用户实际使用空间**
   - 统计所有未删除文件的大小总和

2. **更新 storage_used**
   - 更新用户表中的 storage_used 字段

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_files | SELECT | 查询用户文件 |
| file_storage | SELECT | 获取文件大小 |
| users | UPDATE | 更新已使用存储 |

**SQL 示例：**
```sql
-- 计算实际使用空间
SELECT SUM(fs.file_size) as total_used
FROM user_files uf
JOIN file_storage fs ON uf.storage_id = fs.id
WHERE uf.user_id = ? AND uf.is_deleted = FALSE AND uf.file_type = 'file'

-- 更新用户存储
UPDATE users SET storage_used = ? WHERE id = ?
```

---

## 7. 管理员功能流程

### 7.1 用户管理流程

#### 7.1.1 查看所有用户

**流程步骤：**

1. **验证管理员权限**
   - 检查当前用户 role = 'admin'

2. **查询用户列表**
   - 获取所有用户信息（含 `session_version`、`last_session_kick_at` 等，以实现为准）

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 查询所有用户 |

**SQL 示例：**
```sql
-- 查询所有用户（字段以实现 / Prisma select 为准）
SELECT id, username, email, role, storage_quota, storage_used, status,
       session_version, last_session_kick_at, created_at
FROM users
ORDER BY id ASC
```

#### 7.1.2 禁用/启用用户

**流程步骤：**

1. **验证管理员权限**

2. **更新用户状态**
   - 设置 `status = 'disabled'` 或 `'active'`

3. **禁用时：强失效会话**
   - `users.session_version` 递增，`last_session_kick_at` 写入当前时间
   - 将该用户所有 `refresh_tokens.is_revoked = TRUE`

4. **重新启用时（以实现为准）**
   - 可清除 `last_session_kick_at`，便于管理端「登录状态」展示恢复为在线

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | UPDATE | 更新状态、`session_version`、`last_session_kick_at` |
| refresh_tokens | UPDATE | 禁用时撤销 Token |
| operation_logs | INSERT | 记录操作 |

**SQL 示例（逻辑示意）：**
```sql
-- 禁用用户并踢出所有会话
UPDATE users SET
  status = 'disabled',
  session_version = session_version + 1,
  last_session_kick_at = NOW(),
  updated_at = NOW()
WHERE id = ?

UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = ?

-- 重新启用（示例：仅恢复状态与展示标记，不自动恢复旧 JWT）
UPDATE users SET status = 'active', last_session_kick_at = NULL, updated_at = NOW() WHERE id = ?
```

#### 7.1.3 管理员踢出用户会话

**流程步骤：**

1. **验证管理员权限**，且不能踢出当前登录管理员本人（以实现为准）。
2. **`users.session_version` 递增**，`last_session_kick_at = NOW()`。
3. **该用户所有** `refresh_tokens` **标记** `is_revoked = TRUE`。
4. （可选）管理员将「登录状态」开关拨回「在线」仅清除 `last_session_kick_at`，**不**回退 `session_version`。

**接口（以实现为准）**：`POST /api/admin/users/:id/kick-sessions`；清除展示标记：`POST /api/admin/users/:id/clear-session-kick-marker`。

---

### 7.2 存储统计流程

**流程步骤：**

1. **统计系统总存储**
   - 统计所有物理文件的总大小

2. **统计用户存储排行**
   - 按用户统计存储使用情况

3. **返回统计数据**

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_storage | SELECT | 统计物理文件总大小 |
| users | SELECT | 统计用户存储使用 |

**SQL 示例：**
```sql
-- 统计系统总存储
SELECT 
    COUNT(*) as total_files,
    SUM(file_size) as total_size,
    SUM(CASE WHEN status = 'active' THEN file_size ELSE 0 END) as active_size,
    SUM(CASE WHEN status = 'pending_delete' THEN file_size ELSE 0 END) as pending_delete_size
FROM file_storage

-- 用户存储排行
SELECT id, username, role, storage_quota, storage_used,
       ROUND((storage_used / storage_quota) * 100, 2) as usage_percentage
FROM users
WHERE role IN ('user', 'vip')
ORDER BY storage_used DESC
LIMIT 20
```

---

### 7.3 无引用物理文件回收（产品说明）

与 [REQUIREMENTS.md](./REQUIREMENTS.md) **§4(2)**、**§2(6)** 一致：**不提供**管理员手动清理无引用物理文件的入口（避免误操作与过高维护成本）。  

**实际回收路径**：仅通过 **定时任务** 处理 `status = 'pending_delete'` 且已超过保留期的记录，详见下文 **「8.2 清理待删除文件任务」**（按 `marked_delete_at` 等字段与 **24 小时** 规则执行，以实现为准）。

> 历史文档中曾描述「管理员手动清理」流程，已废止，不再作为业务流程要求。

---

## 8. 定时任务流程

### 8.1 清理过期分片任务

**执行频率：** 每小时执行一次

**流程步骤：**

1. **查询过期分片**
   - 查找创建时间超过24小时的分片记录

2. **删除物理分片文件**
   - 从服务器删除分片文件

3. **删除数据库记录**
   - 删除 upload_chunks 记录

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| upload_chunks | SELECT | 查询过期分片 |
| upload_chunks | DELETE | 删除分片记录 |

**SQL 示例：**
```sql
-- 查询过期分片
SELECT id, chunk_path FROM upload_chunks
WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)

-- 删除分片记录
DELETE FROM upload_chunks WHERE id = ?
```

---

### 8.2 清理待删除文件任务

**执行频率：** 每小时执行一次

**流程步骤：**

1. **查询待删除文件**
   - 查找 status = 'pending_delete'
   - marked_delete_at + 24小时 < NOW()

2. **删除物理文件**
   - 从服务器删除文件

3. **删除数据库记录**
   - 删除 file_storage 记录

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_storage | SELECT | 查询待删除文件 |
| file_storage | DELETE | 删除文件记录 |

**SQL 示例：**
```sql
-- 查询待删除文件
SELECT id, file_path FROM file_storage
WHERE status = 'pending_delete' 
AND marked_delete_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)

-- 删除文件记录
DELETE FROM file_storage WHERE id = ?
```

---

### 8.3 清理过期 Refresh Token 任务

**执行频率：** 每天执行一次

**流程步骤：**

1. **查询过期Token**
   - 查找 expires_at < NOW() 的记录

2. **删除过期Token**
   - 删除 refresh_tokens 记录

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| refresh_tokens | DELETE | 删除过期Token |

**SQL 示例：**
```sql
-- 删除过期Token
DELETE FROM refresh_tokens WHERE expires_at < NOW()
```

---

### 8.4 更新分享状态任务

**执行频率：** 每小时执行一次

**流程步骤：**

1. **查询过期分享**
   - 查找 expire_at < NOW() 且 status = 'active'

2. **更新分享状态**
   - 设置 status = 'expired'

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| file_shares | UPDATE | 更新过期分享状态 |

**SQL 示例：**
```sql
-- 更新过期分享
UPDATE file_shares 
SET status = 'expired' 
WHERE expire_at < NOW() AND status = 'active'
```

---

### 8.5 检查VIP过期任务

**执行频率：** 每天执行一次

**流程步骤：**

1. **查询过期VIP用户**
   - 查找 vip_expire_at < NOW() 且 role = 'vip'

2. **降级为普通用户**
   - 设置 role = 'user'
   - 更新 storage_quota = 1GB
   - 清空 vip_expire_at

3. **检查存储超限**
   - 如果 storage_used > 1GB，标记用户需要清理文件

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | 查询过期VIP |
| users | UPDATE | 降级为普通用户 |

**SQL 示例：**
```sql
-- 查询过期VIP
SELECT id, storage_used FROM users
WHERE role = 'vip' AND vip_expire_at < NOW()

-- 降级为普通用户
UPDATE users 
SET role = 'user', 
    storage_quota = 1073741824,
    vip_expire_at = NULL,
    updated_at = NOW()
WHERE id = ?
```

---

## 9. 用户设置流程

### 9.1 获取用户配置流程

**流程步骤：**

1. **用户登录成功**
   - 登录接口返回用户信息

2. **获取用户配置**
   - 请求 `/api/user-preferences` 接口
   - 查询 `user_preferences` 表

3. **初始化配置**
   - 如果不存在配置，返回默认值（跟随浏览器/系统）
   - 如果存在配置，返回 `locale` 和 `theme`

4. **前端应用配置**
   - 设置应用语言
   - 设置应用主题（深色/浅色）

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_preferences | SELECT | 查询用户配置 |

**SQL 示例：**
```sql
-- 查询用户配置
SELECT locale, theme FROM user_preferences WHERE user_id = ?
```

### 9.2 更新用户配置流程

**流程步骤：**

1. **用户切换设置**
   - 切换语言或主题

2. **立即应用**
   - 前端立即更新 UI
   - 保存到 LocalStorage（本地缓存）

3. **异步保存**
   - 调用 `/api/user-preferences` 接口（PUT）
   - 更新数据库

4. **数据库操作**
   - 使用 `UPSERT` 逻辑（存在则更新，不存在则插入）

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| user_preferences | INSERT/UPDATE | 保存用户配置 |

**SQL 示例：**
```sql
-- 保存用户配置（MySQL ON DUPLICATE KEY UPDATE）
INSERT INTO user_preferences (user_id, locale, theme)
VALUES (?, ?, ?)
ON DUPLICATE KEY UPDATE locale = VALUES(locale), theme = VALUES(theme), updated_at = NOW()
```

### 9.3 个人信息与资料更新（头像 / 邮箱）

**入口**：顶栏用户菜单「个人信息」「设置」弹窗（前端 `PersonalInfoDialog`、`UserSettingsDialog`）。

**个人信息（只读展示为主）**

1. 打开弹窗时请求 `GET /api/user/profile`。
2. 后端查询 `users` 表对应字段（含 `avatar_url`、`vip_expire_at`、`storage_quota`、`storage_used`、`status` 等）并返回。
3. 「进入会员中心」仅打开会员中心弹窗，不单独写库。

**设置 — 邮箱**

1. 用户在「设置」中点击「修改」后编辑邮箱，点击「保存」。
2. 前端校验邮箱格式（非空须合法；空串表示清空）。
3. `PUT /api/user/profile`，body：`{ "email": "<string>" }`。
4. 后端更新 `users.email`；若违反唯一约束返回错误。

**设置 — 头像**

1. 用户选择图片上传，`POST /api/user/avatar`，`multipart/form-data`，字段名 **`avatar`**。
2. 后端将文件保存至 `uploads/avatars/`，更新 `users.avatar_url` 为可访问相对路径（如 `/uploads/avatars/xxx.jpg`）；可删除用户上一张头像文件（以实现为准）。
3. 前端用静态资源基地址拼接 URL 展示（如 `VITE_API_BASE_URL` + 路径）。

**设置 — 修改密码（非强制改密场景）**

1. 用户填写当前密码、新密码、确认新密码；前端校验新密码强度（与注册规则一致：至少 8 位，数字 / 小写 / 大写 / 特殊字符至少三种）及两次新密码一致。
2. `POST /api/auth/change-password`，body：`currentPassword`、`newPassword`（当用户 `must_change_password` 为 false 时后端校验原密码）。
3. 成功后返回新 `accessToken`，前端更新本地令牌；`must_change_password` 保持为 false。

**涉及的表操作：**

| 表名 | 操作类型 | 说明 |
|------|---------|------|
| users | SELECT | `getProfile` |
| users | UPDATE | `updateProfile`（email）、`uploadAvatar`（avatar_url） |

**说明**：若 Access Token 携带 `must_change_password`（管理员重置后的临时密码登录），中间件会限制除白名单外的 API；用户须先完成强制改密后，方可调用上述资料接口（与实现对齐）。

---

## 10. 流程总结

### 10.1 核心表使用频率

| 表名 | 使用频率 | 主要操作 | 说明 |
|------|---------|---------|------|
| users | 极高 | SELECT, UPDATE | 几乎所有操作都需要验证用户 |
| user_files | 极高 | SELECT, INSERT, UPDATE, DELETE | 文件管理核心表 |
| file_storage | 高 | SELECT, INSERT, UPDATE | 物理文件管理 |
| refresh_tokens | 高 | SELECT, INSERT, UPDATE | 认证核心表 |
| operation_logs | 高 | INSERT | 记录所有重要操作 |
| upload_chunks | 中 | INSERT, SELECT, DELETE | 分片上传时使用 |
| file_shares | 中 | SELECT, INSERT, UPDATE | 分享功能 |
| messages | 中 | SELECT, INSERT, UPDATE | 消息功能 |
| friendships | 中 | SELECT, INSERT, UPDATE, DELETE | 好友功能 |
| login_logs | 中 | INSERT | 登录时记录 |
| file_tags | 低 | SELECT, INSERT | 标签功能 |
| user_file_tags | 低 | SELECT, INSERT, DELETE | 标签关联 |
| share_access_logs | 低 | INSERT | 分享访问记录 |
| file_versions | 低 | SELECT, INSERT | 版本管理（可选） |
| user_preferences | 低 | SELECT, INSERT, UPDATE | 用户界面设置 |

---

### 10.2 性能优化建议

**高频查询优化：**
1. users 表：username, email 建立唯一索引
2. user_files 表：(user_id, parent_id, is_deleted) 复合索引
3. file_storage 表：file_hash 唯一索引
4. refresh_tokens 表：(user_id, is_revoked, expires_at) 复合索引

**缓存策略：**
1. 用户信息缓存（Redis）
2. 文件哈希缓存（秒传检测）
3. 好友关系缓存
4. 分享链接缓存

**分区策略：**
1. operation_logs 按月分区
2. login_logs 按月分区
3. share_access_logs 按月分区

---

### 10.3 事务处理建议

**需要事务的操作：**

1. **文件上传（秒传）**
   ```sql
   BEGIN;
   UPDATE file_storage SET reference_count = reference_count + 1 WHERE id = ?;
   INSERT INTO user_files (...) VALUES (...);
   UPDATE users SET storage_used = storage_used + ? WHERE id = ?;
   COMMIT;
   ```

2. **文件彻底删除**
   ```sql
   BEGIN;
   DELETE FROM user_files WHERE id = ?;
   UPDATE file_storage SET reference_count = reference_count - 1 WHERE id = ?;
   UPDATE users SET storage_used = storage_used - ? WHERE id = ?;
   COMMIT;
   ```

3. **接受好友请求**
   ```sql
   BEGIN;
   UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?;
   INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted');
   COMMIT;
   ```

---

## 10. 附录

### 10.1 常用查询示例

**查询用户文件列表（带分页）：**
```sql
SELECT uf.id, uf.file_name, uf.file_type, uf.created_at, 
       fs.file_size, fs.mime_type
FROM user_files uf
LEFT JOIN file_storage fs ON uf.storage_id = fs.id
WHERE uf.user_id = ? AND uf.parent_id = ? AND uf.is_deleted = FALSE
ORDER BY uf.file_type DESC, uf.created_at DESC
LIMIT ? OFFSET ?
```

**查询文件夹路径（面包屑导航）：**
```sql
WITH RECURSIVE folder_path AS (
    SELECT id, parent_id, file_name, 0 as level
    FROM user_files
    WHERE id = ?
    
    UNION ALL
    
    SELECT uf.id, uf.parent_id, uf.file_name, fp.level + 1
    FROM user_files uf
    JOIN folder_path fp ON uf.id = fp.parent_id
)
SELECT id, file_name FROM folder_path
ORDER BY level DESC
```

**查询未读消息数量：**
```sql
SELECT COUNT(*) as unread_count
FROM messages
WHERE receiver_id = ? AND is_read = FALSE
```

---

**文档版本**：v1.1  
**最后更新**：2026-04-19
