-- AlterTable
ALTER TABLE `document_index_jobs` ADD COLUMN `summary_genre` ENUM('novel', 'general_nonfiction', 'technical', 'textbook', 'lab_report', 'paper') NULL;

-- CreateTable
CREATE TABLE `document_summaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_file_id` INTEGER NOT NULL,
    `type` ENUM('chunk', 'chapter', 'book', 'theme') NOT NULL,
    `ref_key` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_summaries_user_file_id_type_ref_key_key`(`user_file_id`, `type`, `ref_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_summaries` ADD CONSTRAINT `document_summaries_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
