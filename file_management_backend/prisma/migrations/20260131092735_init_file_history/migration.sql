/*
  Warnings:

  - You are about to drop the `file_versions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `file_versions` DROP FOREIGN KEY `file_versions_storage_id_fkey`;

-- DropForeignKey
ALTER TABLE `file_versions` DROP FOREIGN KEY `file_versions_user_file_id_fkey`;

-- AlterTable
ALTER TABLE `user_files` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE `file_versions`;

-- CreateTable
CREATE TABLE `file_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_file_id` INTEGER NOT NULL,
    `storage_id` INTEGER NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `version` INTEGER NOT NULL,
    `file_size` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `file_histories_user_file_id_version_idx`(`user_file_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `file_histories` ADD CONSTRAINT `file_histories_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_histories` ADD CONSTRAINT `file_histories_storage_id_fkey` FOREIGN KEY (`storage_id`) REFERENCES `file_storage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
