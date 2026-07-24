-- CreateTable
CREATE TABLE `file_fingerprints` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_file_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `image_embedding` JSON NULL,
    `status` ENUM('pending', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `error_message` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `file_fingerprints_user_file_id_key`(`user_file_id`),
    INDEX `file_fingerprints_user_id_status_idx`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `file_fingerprints` ADD CONSTRAINT `file_fingerprints_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_fingerprints` ADD CONSTRAINT `file_fingerprints_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
