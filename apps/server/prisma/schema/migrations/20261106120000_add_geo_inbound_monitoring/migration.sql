-- 入站请求访问记录表（GEO 中间件异步上报）
CREATE TABLE `GeoAccessEvent` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NULL,
    `host` VARCHAR(128) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `method` VARCHAR(8) NOT NULL,
    `request_url` VARCHAR(768) NOT NULL,
    `client_ip` VARCHAR(64) NOT NULL,
    `peer_ip` VARCHAR(64) NOT NULL,
    `user_agent` VARCHAR(512) NOT NULL,
    `referer` VARCHAR(512) NULL,
    `browser_name` VARCHAR(32) NOT NULL,
    `browser_version` VARCHAR(32) NULL,
    `resource_type` VARCHAR(16) NOT NULL,
    `access_category` VARCHAR(16) NOT NULL,
    `agent_token` VARCHAR(64) NULL,
    `vendor` VARCHAR(64) NOT NULL DEFAULT 'unknown',
    `status` INTEGER NULL,
    `duration_ms` INTEGER NOT NULL,
    `completion` VARCHAR(16) NOT NULL,
    `country` VARCHAR(64) NULL,
    `region` VARCHAR(64) NULL,
    `city` VARCHAR(64) NULL,
    `geo_source` VARCHAR(32) NULL,
    `geo_db_version` VARCHAR(32) NULL,
    `occurred_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `GeoAccessEvent_site_id_occurred_at_idx`(`site_id`, `occurred_at`),
    INDEX `GeoAccessEvent_occurred_at_idx`(`occurred_at`),
    INDEX `GeoAccessEvent_client_ip_idx`(`client_ip`),
    INDEX `GeoAccessEvent_access_category_occurred_at_idx`(`access_category`, `occurred_at`),
    INDEX `GeoAccessEvent_path_idx`(`path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 客户需求提交表（聊天式需求表单唯一落库入口）
CREATE TABLE `DemandSubmission` (
    `id` VARCHAR(36) NOT NULL,
    `site_id` VARCHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `contact_name` VARCHAR(64) NULL,
    `phone` VARCHAR(32) NULL,
    `wechat` VARCHAR(64) NULL,
    `email` VARCHAR(128) NULL,
    `other_contact` VARCHAR(255) NULL,
    `source_url` VARCHAR(512) NULL,
    `submit_key` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `note` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `DemandSubmission_site_id_created_at_idx`(`site_id`, `created_at`),
    INDEX `DemandSubmission_status_idx`(`status`),
    INDEX `DemandSubmission_created_at_idx`(`created_at`),
    UNIQUE INDEX `DemandSubmission_site_id_submit_key_key`(`site_id`, `submit_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- IP 封禁名单（平台全部站点需求接口共用）
CREATE TABLE `GeoIpBan` (
    `id` VARCHAR(36) NOT NULL,
    `ip` VARCHAR(64) NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'auto',
    `expires_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `GeoIpBan_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `GeoIpBan_ip_key`(`ip`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
