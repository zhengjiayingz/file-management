-- Sync: schema.prisma 中已有、但此前仅用 db push 未写入迁移的字段/表

-- users
ALTER TABLE `users` ADD COLUMN `avatar_url` VARCHAR(500) NULL;
ALTER TABLE `users` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `last_session_kick_at` DATETIME(3) NULL;

-- file_shares
ALTER TABLE `file_shares` ADD COLUMN `user_file_ids` JSON NULL;
ALTER TABLE `file_shares` ADD COLUMN `auto_fill_extract` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `file_shares` ADD COLUMN `max_visitors` INTEGER NULL;

-- vip_upgrade_requests
CREATE TABLE `vip_upgrade_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicant_id` INTEGER NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `processed_by_id` INTEGER NULL,
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vip_upgrade_requests_status_idx`(`status`),
    INDEX `vip_upgrade_requests_applicant_id_status_idx`(`applicant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `vip_upgrade_requests` ADD CONSTRAINT `vip_upgrade_requests_applicant_id_fkey` FOREIGN KEY (`applicant_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `vip_upgrade_requests` ADD CONSTRAINT `vip_upgrade_requests_processed_by_id_fkey` FOREIGN KEY (`processed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
