-- AlterTable
ALTER TABLE `document_chunks` ADD COLUMN `start_ms` INTEGER NULL;
ALTER TABLE `document_chunks` ADD COLUMN `end_ms` INTEGER NULL;