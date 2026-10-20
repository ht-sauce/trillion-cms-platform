-- 一次性环境修复：业务表名大小写对齐（Windows 导库到 Linux 后表名被小写化）
--
-- 症状：服务端报
--   Invalid `prisma.adminUser.findUnique()` invocation:
--   The table `AdminUser` does not exist in the current database.
-- 成因：Windows MySQL（lower_case_table_names=1）导出/导入会把表名落成小写，而 Linux MySQL 默认
--   lower_case_table_names=0（区分大小写）；Prisma 模型未写 @@map，按模型名 `AdminUser` 查询，
--   于是表名不匹配报「表不存在」。
-- 处置：按下方映射把 21 张业务表改回大驼峰（与 Prisma 模型名、迁移基线 DDL 一致）。仅改表名、
--   不动数据行；InnoDB 会自动改写子表里指向被改名表的外键定义（已在 MySQL 8.0.40 / lctn=0 实测）。
--   `_prisma_migrations` 必须保持小写（Prisma 硬编码该名），故不在映射内。
-- 为何不做成迁移文件：这是「导库工具造成的事实偏差」，不是结构变更；且它只对从 Windows 导入的库成立，
--   正常由迁移建出的库表名本就是大驼峰，做成迁移会对这些库误报。
-- 幂等：只处理「小写源表存在且大驼峰目标表不存在」的项；已对齐、重复执行、混合大小写残留均整体跳过。
-- 用法（执行前先备份；脚本依赖 DATABASE()，须先选库）：
--   mysql -h <host> -P <port> -u <user> -p -D <db> < prisma/maintenance/fix-table-name-case.sql
-- 触发时机：每次从 Windows 导出并导入到 Linux 之后都要跑一次。
-- 手动维护口径同其它迁移，见 docs/spec/04-data-model.md §6

-- ① 前置核对：应输出 21 行全小写；mixed_case_count 为 0 表示尚未对齐（非 0 说明已改过）
SELECT table_name FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND BINARY TABLE_NAME = BINARY LOWER(TABLE_NAME)
ORDER BY table_name;
SELECT COUNT(*) AS mixed_case_count FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND BINARY TABLE_NAME <> BINARY LOWER(TABLE_NAME);

-- ② 按映射生成并执行原子改名（无待处理项时执行 `DO 0`，安全跳过）
SET @sql := (SELECT GROUP_CONCAT(CONCAT('`', m.lower_name, '` TO `', m.camel_name, '`') SEPARATOR ', ')
  FROM (
    SELECT 'adminuser' AS lower_name, 'AdminUser' AS camel_name
    UNION ALL SELECT 'aicrawlevent', 'AiCrawlEvent'
    UNION ALL SELECT 'blockdefinition', 'BlockDefinition'
    UNION ALL SELECT 'blockdefinitionversion', 'BlockDefinitionVersion'
    UNION ALL SELECT 'channel', 'Channel'
    UNION ALL SELECT 'entity', 'Entity'
    UNION ALL SELECT 'faqitem', 'FaqItem'
    UNION ALL SELECT 'member', 'Member'
    UNION ALL SELECT 'menu', 'Menu'
    UNION ALL SELECT 'navigation', 'Navigation'
    UNION ALL SELECT 'navigationitem', 'NavigationItem'
    UNION ALL SELECT 'newsarticle', 'NewsArticle'
    UNION ALL SELECT 'page', 'Page'
    UNION ALL SELECT 'publishtask', 'PublishTask'
    UNION ALL SELECT 'role', 'Role'
    UNION ALL SELECT 'rolemenu', 'RoleMenu'
    UNION ALL SELECT 'site', 'Site'
    UNION ALL SELECT 'sitedomain', 'SiteDomain'
    UNION ALL SELECT 'staticfile', 'StaticFile'
    UNION ALL SELECT 'template', 'Template'
    UNION ALL SELECT 'trackevent', 'TrackEvent'
  ) m
  JOIN information_schema.TABLES s
    ON s.TABLE_SCHEMA = DATABASE() AND BINARY s.TABLE_NAME = BINARY m.lower_name
  LEFT JOIN information_schema.TABLES c
    ON c.TABLE_SCHEMA = DATABASE() AND BINARY c.TABLE_NAME = BINARY m.camel_name
  WHERE c.TABLE_NAME IS NULL);
SET @sql := IFNULL(CONCAT('RENAME TABLE ', @sql), 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ③ 后置核对：camel_case_tables 期望 21；外键 7 条且 referenced_table_name 全为大驼峰
SELECT COUNT(*) AS camel_case_tables FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND BINARY TABLE_NAME <> BINARY LOWER(TABLE_NAME);
SELECT constraint_name, table_name, referenced_table_name
FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE() ORDER BY table_name;

-- ④ 冒烟：两处核心表可读
SELECT COUNT(*) AS admin_user_rows FROM `AdminUser`;
SELECT COUNT(*) AS page_rows FROM `Page`;
