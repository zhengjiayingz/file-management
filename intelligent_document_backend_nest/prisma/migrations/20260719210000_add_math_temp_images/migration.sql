-- CreateTable
CREATE TABLE `math_temp_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `temp_image_id` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `storage_key` VARCHAR(500) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `original_name` VARCHAR(255) NULL,
    `file_size` BIGINT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `promoted_user_file_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `math_temp_images_temp_image_id_key`(`temp_image_id`),
    INDEX `math_temp_images_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `temp_ai_chat_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `temp_image_id` VARCHAR(64) NOT NULL,
    `mode` ENUM('selection', 'rag', 'solve') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `temp_ai_chat_sessions_user_id_temp_image_id_mode_key`(`user_id`, `temp_image_id`, `mode`),
    INDEX `temp_ai_chat_sessions_temp_image_id_mode_idx`(`temp_image_id`, `mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `temp_ai_chat_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `role` ENUM('user', 'assistant') NOT NULL,
    `content` TEXT NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `temp_ai_chat_messages_session_id_created_at_idx`(`session_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `math_temp_images` ADD CONSTRAINT `math_temp_images_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temp_ai_chat_sessions` ADD CONSTRAINT `temp_ai_chat_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temp_ai_chat_sessions` ADD CONSTRAINT `temp_ai_chat_sessions_temp_image_id_fkey` FOREIGN KEY (`temp_image_id`) REFERENCES `math_temp_images`(`temp_image_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temp_ai_chat_messages` ADD CONSTRAINT `temp_ai_chat_messages_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `temp_ai_chat_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
