-- AlterTable: replace password_min_categories with password_required_categories (explicit category set)

ALTER TABLE `system_settings` ADD COLUMN `password_required_categories` JSON NULL;

UPDATE `system_settings` SET `password_required_categories` = CASE `password_min_categories`
    WHEN 1 THEN JSON_ARRAY('digit')
    WHEN 2 THEN JSON_ARRAY('digit', 'lower')
    WHEN 3 THEN JSON_ARRAY('digit', 'lower', 'upper')
    ELSE JSON_ARRAY('digit', 'lower', 'upper', 'special')
END;

ALTER TABLE `system_settings` MODIFY `password_required_categories` JSON NOT NULL;

ALTER TABLE `system_settings` DROP COLUMN `password_min_categories`;
