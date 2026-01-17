-- ============================================
-- 文件管理系统数据库建表脚本
-- 数据库: file_management
-- 版本: v1.0
-- 创建日期: 2026-01-16
-- ============================================

-- 设置字符集
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- 1. 用户表 (users)
-- ============================================
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username` VARCHAR(50) NOT NULL COMMENT '用户名',
  `password` VARCHAR(64) NOT NULL COMMENT '密码（SHA256加密）',
  `email` VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  `role` ENUM('user', 'vip', 'admin') NOT NULL DEFAULT 'user' COMMENT '用户角色',
  `storage_quota` BIGINT NOT NULL COMMENT '存储配额（字节）',
  `storage_used` BIGINT NOT NULL DEFAULT 0 COMMENT '已使用存储（字节）',
  `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active' COMMENT '账户状态',
  `vip_expire_at` DATETIME DEFAULT NULL COMMENT 'VIP过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ============================================
-- 2. 物理文件存储表 (file_storage)
-- ============================================
DROP TABLE IF EXISTS `file_storage`;
CREATE TABLE `file_storage` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '物理文件ID',
  `file_hash` VARCHAR(64) NOT NULL COMMENT '文件MD5哈希值',
  `file_path` VARCHAR(500) NOT NULL COMMENT '服务器存储路径',
  `file_size` BIGINT NOT NULL COMMENT '文件大小（字节）',
  `mime_type` VARCHAR(100) NOT NULL COMMENT '文件MIME类型',
  `reference_count` INT NOT NULL DEFAULT 0 COMMENT '引用计数',
  `status` ENUM('active', 'pending_delete') NOT NULL DEFAULT 'active' COMMENT '文件状态',
  `marked_delete_at` DATETIME DEFAULT NULL COMMENT '标记删除时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_hash` (`file_hash`),
  KEY `idx_status_marked` (`status`, `marked_delete_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物理文件存储表';

-- ============================================
-- 3. 用户文件表 (user_files)
-- ============================================
DROP TABLE IF EXISTS `user_files`;
CREATE TABLE `user_files` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '用户文件ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `storage_id` INT DEFAULT NULL COMMENT '物理文件ID（文件夹为NULL）',
  `parent_id` INT DEFAULT NULL COMMENT '父文件夹ID（根目录为NULL）',
  `file_name` VARCHAR(255) NOT NULL COMMENT '文件/文件夹名称',
  `file_type` ENUM('file', 'folder') NOT NULL COMMENT '类型',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否删除（软删除）',
  `deleted_at` DATETIME DEFAULT NULL COMMENT '删除时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_parent_deleted` (`user_id`, `parent_id`, `is_deleted`),
  KEY `idx_storage_id` (`storage_id`),
  CONSTRAINT `fk_user_files_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_files_storage` FOREIGN KEY (`storage_id`) REFERENCES `file_storage` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_files_parent` FOREIGN KEY (`parent_id`) REFERENCES `user_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户文件表';

-- ============================================
-- 4. 文件分片上传记录表 (upload_chunks)
-- ============================================
DROP TABLE IF EXISTS `upload_chunks`;
CREATE TABLE `upload_chunks` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `file_hash` VARCHAR(64) NOT NULL COMMENT '文件哈希',
  `chunk_index` INT NOT NULL COMMENT '分片索引',
  `chunk_hash` VARCHAR(64) NOT NULL COMMENT '分片哈希',
  `chunk_size` INT NOT NULL COMMENT '分片大小',
  `chunk_path` VARCHAR(500) NOT NULL COMMENT '分片存储路径',
  `status` ENUM('uploading', 'completed', 'failed') NOT NULL DEFAULT 'uploading' COMMENT '状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_chunk` (`file_hash`, `chunk_index`),
  KEY `idx_user_file` (`user_id`, `file_hash`),
  CONSTRAINT `fk_upload_chunks_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件分片上传记录表';

-- ============================================
-- 5. 文件分享表 (file_shares)
-- ============================================
DROP TABLE IF EXISTS `file_shares`;
CREATE TABLE `file_shares` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '分享ID',
  `user_id` INT NOT NULL COMMENT '分享者ID',
  `user_file_id` INT NOT NULL COMMENT '用户文件ID',
  `share_code` VARCHAR(32) NOT NULL COMMENT '分享码（唯一标识）',
  `extract_code` VARCHAR(6) DEFAULT NULL COMMENT '提取码（私密分享）',
  `permission` ENUM('view', 'download', 'edit') NOT NULL DEFAULT 'download' COMMENT '权限',
  `expire_at` DATETIME DEFAULT NULL COMMENT '过期时间（NULL表示永久）',
  `view_count` INT NOT NULL DEFAULT 0 COMMENT '访问次数',
  `download_count` INT NOT NULL DEFAULT 0 COMMENT '下载次数',
  `status` ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active' COMMENT '状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_share_code` (`share_code`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status_expire` (`status`, `expire_at`),
  CONSTRAINT `fk_file_shares_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_file_shares_file` FOREIGN KEY (`user_file_id`) REFERENCES `user_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件分享表';

-- ============================================
-- 6. 分享访问记录表 (share_access_logs)
-- ============================================
DROP TABLE IF EXISTS `share_access_logs`;
CREATE TABLE `share_access_logs` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `share_id` INT NOT NULL COMMENT '分享ID',
  `visitor_id` INT DEFAULT NULL COMMENT '访问者ID（未登录为NULL）',
  `ip_address` VARCHAR(45) NOT NULL COMMENT 'IP地址',
  `user_agent` VARCHAR(500) DEFAULT NULL COMMENT '浏览器信息',
  `action` ENUM('view', 'download') NOT NULL COMMENT '操作类型',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '访问时间',
  PRIMARY KEY (`id`),
  KEY `idx_share_created` (`share_id`, `created_at`),
  CONSTRAINT `fk_share_logs_share` FOREIGN KEY (`share_id`) REFERENCES `file_shares` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_share_logs_visitor` FOREIGN KEY (`visitor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分享访问记录表';

-- ============================================
-- 7. 好友关系表 (friendships)
-- ============================================
DROP TABLE IF EXISTS `friendships`;
CREATE TABLE `friendships` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '关系ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `friend_id` INT NOT NULL COMMENT '好友ID',
  `status` ENUM('pending', 'accepted', 'rejected', 'blocked') NOT NULL DEFAULT 'pending' COMMENT '状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_friend` (`user_id`, `friend_id`),
  KEY `idx_friend_status` (`friend_id`, `status`),
  CONSTRAINT `fk_friendships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_friendships_friend` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友关系表';

-- ============================================
-- 8. 消息表 (messages)
-- ============================================
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '消息ID',
  `sender_id` INT NOT NULL COMMENT '发送者ID',
  `receiver_id` INT NOT NULL COMMENT '接收者ID',
  `content` TEXT NOT NULL COMMENT '消息内容',
  `message_type` ENUM('text', 'file') NOT NULL DEFAULT 'text' COMMENT '消息类型',
  `file_id` INT DEFAULT NULL COMMENT '文件ID（文件消息）',
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已读',
  `read_at` DATETIME DEFAULT NULL COMMENT '阅读时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  PRIMARY KEY (`id`),
  KEY `idx_receiver_read_created` (`receiver_id`, `is_read`, `created_at`),
  KEY `idx_sender_created` (`sender_id`, `created_at`),
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_file` FOREIGN KEY (`file_id`) REFERENCES `user_files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';

-- ============================================
-- 9. 文件标签表 (file_tags)
-- ============================================
DROP TABLE IF EXISTS `file_tags`;
CREATE TABLE `file_tags` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '标签ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `tag_name` VARCHAR(50) NOT NULL COMMENT '标签名称',
  `color` VARCHAR(7) DEFAULT NULL COMMENT '标签颜色（HEX）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_tag` (`user_id`, `tag_name`),
  CONSTRAINT `fk_file_tags_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件标签表';

-- ============================================
-- 10. 文件标签关联表 (user_file_tags)
-- ============================================
DROP TABLE IF EXISTS `user_file_tags`;
CREATE TABLE `user_file_tags` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '关联ID',
  `user_file_id` INT NOT NULL COMMENT '用户文件ID',
  `tag_id` INT NOT NULL COMMENT '标签ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_tag` (`user_file_id`, `tag_id`),
  KEY `idx_tag_id` (`tag_id`),
  CONSTRAINT `fk_user_file_tags_file` FOREIGN KEY (`user_file_id`) REFERENCES `user_files` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_file_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `file_tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件标签关联表';

-- ============================================
-- 11. 操作日志表 (operation_logs)
-- ============================================
DROP TABLE IF EXISTS `operation_logs`;
CREATE TABLE `operation_logs` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `operation_type` VARCHAR(50) NOT NULL COMMENT '操作类型',
  `resource_type` VARCHAR(50) NOT NULL COMMENT '资源类型',
  `resource_id` INT DEFAULT NULL COMMENT '资源ID',
  `description` VARCHAR(500) DEFAULT NULL COMMENT '操作描述',
  `ip_address` VARCHAR(45) NOT NULL COMMENT 'IP地址',
  `user_agent` VARCHAR(500) DEFAULT NULL COMMENT '浏览器信息',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_operation_created` (`operation_type`, `created_at`),
  CONSTRAINT `fk_operation_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- ============================================
-- 12. 登录日志表 (login_logs)
-- ============================================
DROP TABLE IF EXISTS `login_logs`;
CREATE TABLE `login_logs` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `user_id` INT DEFAULT NULL COMMENT '用户ID（登录失败时可能为NULL）',
  `username` VARCHAR(50) DEFAULT NULL COMMENT '尝试登录的用户名',
  `ip_address` VARCHAR(45) NOT NULL COMMENT 'IP地址',
  `location` VARCHAR(100) DEFAULT NULL COMMENT '登录地点',
  `device` VARCHAR(100) DEFAULT NULL COMMENT '设备信息',
  `user_agent` VARCHAR(500) DEFAULT NULL COMMENT '浏览器信息',
  `status` ENUM('success', 'failed') NOT NULL COMMENT '登录状态',
  `fail_reason` VARCHAR(200) DEFAULT NULL COMMENT '失败原因',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_ip_created` (`ip_address`, `created_at`),
  KEY `idx_username` (`username`),
  CONSTRAINT `fk_login_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录日志表';

-- ============================================
-- 13. 刷新令牌表 (refresh_tokens)
-- ============================================
DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE `refresh_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '令牌ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `token` VARCHAR(500) NOT NULL COMMENT 'Refresh Token',
  `device_name` VARCHAR(100) DEFAULT NULL COMMENT '设备名称',
  `device_type` VARCHAR(50) DEFAULT NULL COMMENT '设备类型（web/mobile/desktop）',
  `ip_address` VARCHAR(45) NOT NULL COMMENT 'IP地址',
  `user_agent` VARCHAR(500) DEFAULT NULL COMMENT '浏览器信息',
  `is_revoked` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已撤销',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `last_used_at` DATETIME DEFAULT NULL COMMENT '最后使用时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`),
  KEY `idx_user_revoked_expires` (`user_id`, `is_revoked`, `expires_at`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='刷新令牌表';

-- ============================================
-- 14. 文件版本表 (file_versions) - 可选功能
-- ============================================
DROP TABLE IF EXISTS `file_versions`;
CREATE TABLE `file_versions` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '版本ID',
  `user_file_id` INT NOT NULL COMMENT '用户文件ID',
  `storage_id` INT NOT NULL COMMENT '物理文件ID',
  `version_number` INT NOT NULL COMMENT '版本号',
  `file_size` BIGINT NOT NULL COMMENT '文件大小',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_file_version` (`user_file_id`, `version_number`),
  CONSTRAINT `fk_file_versions_file` FOREIGN KEY (`user_file_id`) REFERENCES `user_files` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_file_versions_storage` FOREIGN KEY (`storage_id`) REFERENCES `file_storage` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件版本表';

-- ============================================
-- 插入初始数据
-- ============================================

-- 插入管理员账户（密码: Admin@123，SHA256加密后的值需要替换）
-- 注意：实际使用时需要用真实的SHA256加密值替换
INSERT INTO `users` (`username`, `password`, `email`, `role`, `storage_quota`, `storage_used`, `status`) 
VALUES ('admin', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'admin@example.com', 'admin', -1, 0, 'active');

-- 插入测试用户（密码: Test@123）
INSERT INTO `users` (`username`, `password`, `email`, `role`, `storage_quota`, `storage_used`, `status`) 
VALUES ('testuser', '9f735e0df9a1ddc702bf0a1a7b83033f9f7153a00c29de82cedadc9957289b05', 'test@example.com', 'user', 1073741824, 0, 'active');

-- ============================================
-- 恢复外键检查
-- ============================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- 建表完成
-- ============================================
-- 说明：
-- 1. 所有表使用 InnoDB 引擎，支持事务和外键
-- 2. 字符集使用 utf8mb4，支持 emoji 等特殊字符
-- 3. 已创建所有必要的索引和外键约束
-- 4. 默认插入了一个管理员账户和一个测试账户
-- 5. 密码使用 SHA256 加密，实际使用时需要替换为真实加密值
-- 
-- 使用方法：
-- 1. 创建数据库：CREATE DATABASE file_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 2. 选择数据库：USE file_management;
-- 3. 执行此脚本：source /path/to/database-schema.sql;
-- ============================================
