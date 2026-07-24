-- CreateTable
CREATE TABLE `document_index_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_file_id` INTEGER NOT NULL,
    `mode` ENUM('general', 'academic') NOT NULL,
    `status` ENUM('pending', 'extracting', 'chunking', 'embedding', 'summarizing', 'extracting_knowledge', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `progress_msg` VARCHAR(255) NULL,
    `error_message` TEXT NULL,
    `chunk_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_index_jobs_user_file_id_key`(`user_file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_chunks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_file_id` INTEGER NOT NULL,
    `chunk_index` INTEGER NOT NULL,
    `section` ENUM('unknown', 'abstract', 'introduction', 'method', 'results', 'discussion', 'references', 'body', 'chapter') NOT NULL DEFAULT 'body',
    `section_title` VARCHAR(255) NULL,
    `chapter_no` INTEGER NULL,
    `content` TEXT NOT NULL,
    `token_estimate` INTEGER NULL,
    `embedding` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `document_chunks_user_file_id_section_idx`(`user_file_id`, `section`),
    UNIQUE INDEX `document_chunks_user_file_id_chunk_index_key`(`user_file_id`, `chunk_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_index_jobs` ADD CONSTRAINT `document_index_jobs_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_chunks` ADD CONSTRAINT `document_chunks_user_file_id_fkey` FOREIGN KEY (`user_file_id`) REFERENCES `user_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
