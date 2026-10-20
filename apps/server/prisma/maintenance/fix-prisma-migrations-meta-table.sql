-- 一次性环境修复：Prisma 迁移台账表 `_prisma_migrations` 补齐列默认值
--
-- 症状：`pnpm db:deploy` 报
--   Error: Field 'applied_steps_count' doesn't have a default value
--   （schema-engine … apply_migrations.rs；MySQL 错误码 1364，严格模式下 NOT NULL 无默认值且 INSERT 不带该列）
-- 成因：目标库的 `_prisma_migrations` 由旧版 Prisma CLI 建立，`applied_steps_count` 为
--   `INT UNSIGNED NOT NULL` 但**无 DEFAULT**；新版 schema-engine 写台账时不带该列，于是任何迁移都写不进台账，
--   `migrate deploy` 全量失败（与本仓库的业务迁移无关）。
-- 为何不做成迁移文件：迁移自身也要先写这张台账，会形成死锁；只能在业务迁移之前独立执行一次。
-- 幂等：列缺失则补列、有列无默认则补默认、正常则整体跳过，可重复执行。
-- 用法（DSN 取 env/.env.<环境> 的 DB_* 拼装，或直接给 DATABASE_URL）：
--   pnpm exec prisma db execute --url "mysql://<user>:<pass>@<host>:<port>/<db>" \
--     --file prisma/maintenance/fix-prisma-migrations-meta-table.sql
-- 手动维护口径同其它迁移，见 docs/spec/04-data-model.md §6

-- 解析实际表名（表不存在时为 NULL，下方守卫会整体跳过）
SET @mtbl := (SELECT TABLE_NAME FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = '_prisma_migrations' LIMIT 1);

-- 1) applied_steps_count 缺列 -> 补列（Prisma 规范：int unsigned NOT NULL DEFAULT 0）
SET @sql := IFNULL((SELECT IF(COUNT(*) = 0,
  CONCAT('ALTER TABLE `', @mtbl, '` ADD COLUMN `applied_steps_count` INT UNSIGNED NOT NULL DEFAULT 0'),
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = '_prisma_migrations' AND LOWER(COLUMN_NAME) = 'applied_steps_count'), 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) applied_steps_count 有列但 NOT NULL 且无默认 -> 补默认
SET @sql := IFNULL((SELECT IF(COUNT(*) > 0,
  CONCAT('ALTER TABLE `', @mtbl, '` MODIFY `applied_steps_count` INT UNSIGNED NOT NULL DEFAULT 0'),
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = '_prisma_migrations' AND LOWER(COLUMN_NAME) = 'applied_steps_count'
    AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL), 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) started_at 同类隐患防御（Prisma 规范：datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)）
SET @sql := IFNULL((SELECT IF(COUNT(*) > 0,
  CONCAT('ALTER TABLE `', @mtbl, '` MODIFY `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)'),
  'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = '_prisma_migrations' AND LOWER(COLUMN_NAME) = 'started_at'
    AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL), 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
