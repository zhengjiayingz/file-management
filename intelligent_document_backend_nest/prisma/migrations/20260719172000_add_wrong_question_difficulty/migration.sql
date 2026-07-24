-- AlterTable
ALTER TABLE `wrong_question_book_items`
  ADD COLUMN `difficulty` ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium';

-- CreateIndex
CREATE INDEX `wrong_question_book_items_user_id_difficulty_idx` ON `wrong_question_book_items`(`user_id`, `difficulty`);
