-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(36) NOT NULL,
    `username` VARCHAR(32) NOT NULL,
    `password` VARCHAR(128) NOT NULL,
    `display_name` VARCHAR(32) NULL,
    `role_id` VARCHAR(36) NOT NULL,
    `site_ids` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `AdminUser_username_key`(`username`),
    INDEX `AdminUser_role_id_idx`(`role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockDefinition` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(48) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `hint` VARCHAR(255) NOT NULL DEFAULT '',
    `scope` VARCHAR(16) NOT NULL DEFAULT 'public',
    `site_id` VARCHAR(36) NOT NULL DEFAULT '0',
    `code` LONGTEXT NOT NULL,
    `code_hash` VARCHAR(32) NOT NULL,
    `compile_status` VARCHAR(16) NOT NULL DEFAULT 'ok',
    `compile_error` TEXT NULL,
    `declaration` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `BlockDefinition_scope_site_id_idx`(`scope`, `site_id`),
    UNIQUE INDEX `BlockDefinition_key_site_id_key`(`key`, `site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockDefinitionVersion` (
    `id` VARCHAR(36) NOT NULL,
    `block_id` VARCHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `code` LONGTEXT NOT NULL,
    `code_hash` VARCHAR(32) NOT NULL,
    `declaration` JSON NOT NULL,
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `BlockDefinitionVersion_block_id_version_key`(`block_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Channel` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `parent_id` VARCHAR(36) NULL,
    `name` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `path` VARCHAR(512) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `seo_title` VARCHAR(128) NULL,
    `seo_description` VARCHAR(255) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'zh-CN',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `Channel_site_id_idx`(`site_id`),
    UNIQUE INDEX `Channel_site_id_slug_key`(`site_id`, `slug`),
    UNIQUE INDEX `Channel_site_id_path_key`(`site_id`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Page` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `channel_id` VARCHAR(36) NOT NULL,
    `template_id` VARCHAR(32) NOT NULL DEFAULT 'default',
    `title` VARCHAR(128) NOT NULL,
    `slug` VARCHAR(128) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `summary` VARCHAR(512) NULL,
    `seo_title` VARCHAR(128) NULL,
    `seo_description` VARCHAR(255) NULL,
    `seo_keywords` VARCHAR(255) NULL,
    `blocks` JSON NOT NULL,
    `path` VARCHAR(512) NULL,
    `kind` VARCHAR(8) NOT NULL DEFAULT 'static',
    `draft` JSON NULL,
    `content_hash` VARCHAR(32) NOT NULL DEFAULT '',
    `published_hash` VARCHAR(32) NOT NULL DEFAULT '',
    `json_ld` TEXT NULL,
    `json_ld_mode` VARCHAR(16) NOT NULL DEFAULT 'auto_append',
    `editorial` JSON NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `down_at` DATETIME(0) NULL,
    `author_name` VARCHAR(32) NULL,
    `published_at` DATETIME(0) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'zh-CN',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `Page_site_id_status_idx`(`site_id`, `status`),
    INDEX `Page_site_id_channel_id_sort_idx`(`site_id`, `channel_id`, `sort`),
    UNIQUE INDEX `Page_site_id_channel_id_slug_key`(`site_id`, `channel_id`, `slug`),
    UNIQUE INDEX `Page_site_id_path_key`(`site_id`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Template` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(32) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `slots` JSON NOT NULL,
    `builtin` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Template_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Entity` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NULL,
    `name` VARCHAR(128) NOT NULL,
    `aliases` JSON NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'brand',
    `description` VARCHAR(512) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Entity_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Member` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `username` VARCHAR(32) NOT NULL,
    `nickname` VARCHAR(32) NULL,
    `password` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Member_site_id_idx`(`site_id`),
    UNIQUE INDEX `Member_site_id_username_key`(`site_id`, `username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Menu` (
    `id` VARCHAR(36) NOT NULL,
    `parent_id` VARCHAR(36) NULL,
    `title` VARCHAR(32) NOT NULL,
    `path` VARCHAR(128) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(8) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `Menu_parent_id_sort_idx`(`parent_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Navigation` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(16) NOT NULL,
    `title` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `Navigation_site_id_idx`(`site_id`),
    UNIQUE INDEX `Navigation_site_id_key_key`(`site_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NavigationItem` (
    `id` VARCHAR(36) NOT NULL,
    `navigation_id` VARCHAR(36) NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `page_id` VARCHAR(36) NULL,
    `href` VARCHAR(512) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `NavigationItem_navigation_id_sort_idx`(`navigation_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NewsArticle` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `summary` VARCHAR(500) NOT NULL DEFAULT '',
    `content` TEXT NOT NULL,
    `publish_date` VARCHAR(10) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'published',
    `page_id` VARCHAR(36) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `NewsArticle_site_id_idx`(`site_id`),
    UNIQUE INDEX `NewsArticle_site_id_slug_key`(`site_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaqItem` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `question` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `answer` TEXT NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'published',
    `page_id` VARCHAR(36) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `FaqItem_site_id_category_idx`(`site_id`, `category`),
    UNIQUE INDEX `FaqItem_site_id_slug_key`(`site_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishTask` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'page',
    `page_ids` JSON NOT NULL,
    `build_id` VARCHAR(32) NULL,
    `artifact` JSON NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `log` TEXT NULL,
    `triggered_by` VARCHAR(36) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `finished_at` DATETIME(0) NULL,

    INDEX `PublishTask_site_id_status_idx`(`site_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(32) NOT NULL,
    `description` VARCHAR(255) NULL,
    `platform` BOOLEAN NOT NULL DEFAULT false,
    `builtin` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(8) NOT NULL DEFAULT 'active',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    INDEX `Role_sort_idx`(`sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoleMenu` (
    `role_id` VARCHAR(36) NOT NULL,
    `menu_id` VARCHAR(36) NOT NULL,

    INDEX `RoleMenu_menu_id_idx`(`menu_id`),
    PRIMARY KEY (`role_id`, `menu_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Site` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(32) NOT NULL,
    `domain` VARCHAR(128) NOT NULL,
    `icp_number` VARCHAR(64) NULL,
    `police_number` VARCHAR(64) NULL,
    `legal_name` VARCHAR(128) NOT NULL DEFAULT '',
    `common_name` VARCHAR(128) NOT NULL DEFAULT '',
    `abbr_name` JSON NOT NULL,
    `logo_subtitle` VARCHAR(128) NULL,
    `logo_mark` VARCHAR(8) NULL,
    `company_name` VARCHAR(128) NOT NULL,
    `credit_code` VARCHAR(32) NULL,
    `business_license_file_id` VARCHAR(36) NULL,
    `company_address` VARCHAR(255) NULL,
    `contact_phone` VARCHAR(32) NULL,
    `contact_email` VARCHAR(128) NULL,
    `clinic_reg_no` VARCHAR(64) NULL,
    `license_valid_from` VARCHAR(10) NULL,
    `license_valid_to` VARCHAR(10) NULL,
    `org_type` VARCHAR(64) NULL,
    `level` VARCHAR(32) NULL,
    `legal_person` VARCHAR(64) NULL,
    `principal` VARCHAR(64) NULL,
    `found_date` VARCHAR(10) NULL,
    `practice_scopes` JSON NOT NULL,
    `issuing_authority` VARCHAR(128) NULL,
    `address_full` VARCHAR(255) NULL,
    `postal_code` VARCHAR(16) NULL,
    `lat` VARCHAR(32) NULL,
    `lng` VARCHAR(32) NULL,
    `phone` VARCHAR(32) NULL,
    `phone_service_hours` VARCHAR(128) NULL,
    `opening_hours` JSON NOT NULL,
    `medical_insurance` BOOLEAN NOT NULL DEFAULT false,
    `insurance_no` VARCHAR(64) NULL,
    `insurance_note` VARCHAR(255) NULL,
    `same_as` JSON NOT NULL,
    `theme_tokens` JSON NOT NULL,
    `seo_title` VARCHAR(128) NULL,
    `seo_description` VARCHAR(255) NULL,
    `seo_keywords` VARCHAR(255) NULL,
    `logo_file_id` VARCHAR(36) NULL,
    `favicon_file_id` VARCHAR(36) NULL,
    `default_locale` VARCHAR(8) NOT NULL DEFAULT 'zh-CN',
    `robots_policy` JSON NOT NULL,
    `geo_json_ld` TEXT NULL,
    `geo_json_ld_mode` VARCHAR(16) NOT NULL DEFAULT 'auto_append',
    `llms_txt` TEXT NULL,
    `llms_txt_mode` VARCHAR(16) NOT NULL DEFAULT 'auto_append',
    `head_extra` TEXT NULL,
    `head_extra_mode` VARCHAR(16) NOT NULL DEFAULT 'auto_append',
    `robots_meta` JSON NOT NULL,
    `render_mode` VARCHAR(8) NOT NULL DEFAULT 'ssg',
    `theme_config` JSON NOT NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `Site_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteDomain` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `domain` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `SiteDomain_domain_key`(`domain`),
    INDEX `SiteDomain_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaticFile` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `storage_path` VARCHAR(255) NOT NULL,
    `public_url` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(64) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `uploaded_by` VARCHAR(36) NULL,
    `caption` VARCHAR(255) NULL,
    `location` VARCHAR(128) NULL,
    `taken_at` VARCHAR(10) NULL,
    `image_no` VARCHAR(64) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `StaticFile_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrackEvent` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `referrer` VARCHAR(255) NOT NULL,
    `anon_id` VARCHAR(64) NOT NULL,
    `user_agent` VARCHAR(512) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `TrackEvent_site_id_path_idx`(`site_id`, `path`),
    INDEX `TrackEvent_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiCrawlEvent` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `bot_type` VARCHAR(64) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 200,
    `bytes` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `AiCrawlEvent_site_id_bot_type_idx`(`site_id`, `bot_type`),
    INDEX `AiCrawlEvent_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AdminUser` ADD CONSTRAINT `AdminUser_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Menu` ADD CONSTRAINT `Menu_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `Menu`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Navigation` ADD CONSTRAINT `Navigation_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NavigationItem` ADD CONSTRAINT `NavigationItem_navigation_id_fkey` FOREIGN KEY (`navigation_id`) REFERENCES `Navigation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleMenu` ADD CONSTRAINT `RoleMenu_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleMenu` ADD CONSTRAINT `RoleMenu_menu_id_fkey` FOREIGN KEY (`menu_id`) REFERENCES `Menu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteDomain` ADD CONSTRAINT `SiteDomain_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
