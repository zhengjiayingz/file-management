-- CreateTable
CREATE TABLE `system_settings` (
    `id` INTEGER NOT NULL,
    `password_min_length` INTEGER NOT NULL DEFAULT 8,
    `password_min_categories` INTEGER NOT NULL DEFAULT 3,
    `storage_quota_user_bytes` BIGINT NOT NULL,
    `storage_quota_vip_bytes` BIGINT NOT NULL,
    `storage_quota_admin_bytes` BIGINT NOT NULL,
    `max_tags_user` INTEGER NOT NULL DEFAULT 2,
    `max_tags_vip` INTEGER NOT NULL DEFAULT 5,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_settings` (
    `id`,
    `password_min_length`,
    `password_min_categories`,
    `storage_quota_user_bytes`,
    `storage_quota_vip_bytes`,
    `storage_quota_admin_bytes`,
    `max_tags_user`,
    `max_tags_vip`,
    `updated_at`
) VALUES (
    1,
    8,
    3,
    1073741824,
    2147483648,
    107374182400,
    2,
    5,
    CURRENT_TIMESTAMP(3)
);
