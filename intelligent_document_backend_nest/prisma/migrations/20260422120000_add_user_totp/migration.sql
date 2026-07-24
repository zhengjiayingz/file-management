-- AlterTable: 管理员可选 TOTP 两步验证
ALTER TABLE `users` ADD COLUMN `totp_enabled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN `totp_secret` VARCHAR(64) NULL;
ALTER TABLE `users` ADD COLUMN `totp_setup_secret` VARCHAR(64) NULL;
