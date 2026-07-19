-- CreateTable
CREATE TABLE `wrong_question_book_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `user_file_id` INTEGER NULL,
    `question_text` TEXT NOT NULL,
    `answer_text` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `wrong_question_book_items_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `wrong_question_book_items_user_file_id_idx`(`user_file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wrong_question_book_items` ADD CONSTRAINT `wrong_question_book_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wrong_question_book_items` ADD CONSTRAINT `wrong_question_book_items_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
