-- CreateTable
CREATE TABLE `file_ai_chat_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `user_file_id` INTEGER NOT NULL,
    `mode` ENUM('selection', 'rag', 'solve') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `file_ai_chat_sessions_user_id_user_file_id_mode_key`(`user_id`, `user_file_id`, `mode`),
    INDEX `file_ai_chat_sessions_user_file_id_mode_idx`(`user_file_id`, `mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_ai_chat_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `role` ENUM('user', 'assistant') NOT NULL,
    `content` TEXT NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `file_ai_chat_messages_session_id_created_at_idx`(`session_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `file_ai_chat_sessions` ADD CONSTRAINT `file_ai_chat_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_ai_chat_sessions` ADD CONSTRAINT `file_ai_chat_sessions_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_ai_chat_messages` ADD CONSTRAINT `file_ai_chat_messages_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `file_ai_chat_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
