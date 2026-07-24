-- AlterTable: minimum count of categories (from the selected pool) that the password must satisfy

ALTER TABLE `system_settings` ADD COLUMN `password_min_categories_in_pool` INTEGER NOT NULL DEFAULT 4;

UPDATE `system_settings` SET `password_min_categories_in_pool` = JSON_LENGTH(`password_required_categories`);

UPDATE `system_settings` SET `password_min_categories_in_pool` = LEAST(
    `password_min_categories_in_pool`,
    JSON_LENGTH(`password_required_categories`)
);

UPDATE `system_settings` SET `password_min_categories_in_pool` = GREATEST(`password_min_categories_in_pool`, 1);
