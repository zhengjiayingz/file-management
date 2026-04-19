-- 若 file_shares 表由旧版 database-schema.sql 初始化，可能缺少下列列，会导致 POST /api/shares 报 500。
-- 在 MySQL 中执行（列已存在时会报错，可忽略对应语句）。

ALTER TABLE `file_shares`
  ADD COLUMN `user_file_ids` JSON NULL COMMENT '批量分享的 user_files.id 列表' AFTER `user_file_id`;

ALTER TABLE `file_shares`
  ADD COLUMN `auto_fill_extract` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '链接是否带提取码参数' AFTER `expire_at`;

ALTER TABLE `file_shares`
  ADD COLUMN `max_visitors` INT NULL COMMENT '访问人数上限，NULL 不限制' AFTER `auto_fill_extract`;
