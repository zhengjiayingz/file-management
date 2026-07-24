-- AlterTable
ALTER TABLE `system_settings` MODIFY `id` INTEGER NOT NULL DEFAULT 1,
    MODIFY `storage_quota_user_bytes` BIGINT NOT NULL DEFAULT 1073741824,
    MODIFY `storage_quota_vip_bytes` BIGINT NOT NULL DEFAULT 2147483648,
    MODIFY `storage_quota_admin_bytes` BIGINT NOT NULL DEFAULT 107374182400;

-- CreateTable
CREATE TABLE `document_knowledge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_file_id` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_knowledge_user_file_id_key`(`user_file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_knowledge` ADD CONSTRAINT `document_knowledge_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
