-- ============================================
-- 文件管理系统数据库初始化脚本
-- ============================================

-- 1. 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS file_management 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- 2. 使用数据库
USE file_management;

-- 3. 删除已存在的表（如果需要重新创建）
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS users;

-- 4. 创建用户表
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码（bcrypt加密）',
    email VARCHAR(100) COMMENT '邮箱',
    role VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT '角色：admin/user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否激活',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 5. 创建文件表
CREATE TABLE files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE COMMENT '存储的文件名',
    original_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
    mimetype VARCHAR(100) NOT NULL COMMENT '文件类型',
    size BIGINT NOT NULL COMMENT '文件大小（字节）',
    path VARCHAR(500) NOT NULL COMMENT '文件路径',
    user_id INT NOT NULL COMMENT '上传用户ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_filename (filename),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件表';

-- 6. 插入测试用户
-- 密码都是 "123456" 的 bcrypt 加密结果
INSERT INTO users (username, password, email, role) VALUES
('admin', '$2b$10$rqK5p5p5p5p5p5p5p5p5p.OqK5p5p5p5p5p5p5p5p5p5p5p5p5p5p5', 'admin@example.com', 'admin'),
('user1', '$2b$10$rqK5p5p5p5p5p5p5p5p5p.OqK5p5p5p5p5p5p5p5p5p5p5p5p5p5p5', 'user1@example.com', 'user'),
('test', '$2b$10$rqK5p5p5p5p5p5p5p5p5p.OqK5p5p5p5p5p5p5p5p5p5p5p5p5p5p5', 'test@example.com', 'user');

-- 7. 插入测试文件数据
INSERT INTO files (filename, original_name, mimetype, size, path, user_id) VALUES
('test-file-001.txt', 'document.txt', 'text/plain', 1024, './uploads/test-file-001.txt', 1),
('test-file-002.pdf', 'report.pdf', 'application/pdf', 2048, './uploads/test-file-002.pdf', 1),
('test-file-003.jpg', 'photo.jpg', 'image/jpeg', 4096, './uploads/test-file-003.jpg', 2);

-- 8. 查看创建的表
SHOW TABLES;

-- 9. 查看用户表数据
SELECT id, username, email, role, is_active, created_at FROM users;

-- 10. 查看文件表数据
SELECT id, filename, original_name, mimetype, size, user_id, created_at FROM files;

-- 11. 查看表结构
DESCRIBE users;
DESCRIBE files;

-- ============================================
-- 执行完成！
-- ============================================
