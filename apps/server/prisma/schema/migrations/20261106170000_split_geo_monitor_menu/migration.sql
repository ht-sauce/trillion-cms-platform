START TRANSACTION;

INSERT INTO `Menu` (`id`, `parent_id`, `title`, `path`, `sort`, `visible`, `status`, `created_at`, `updated_at`)
SELECT '01a1b1e5-7940-7000-8000-000000000001', NULL, 'GEO 监控', NULL, 5, true, 'active', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)
WHERE NOT EXISTS (SELECT 1 FROM `Menu` WHERE `path` IS NULL AND `title` = 'GEO 监控');

INSERT INTO `Menu` (`id`, `parent_id`, `title`, `path`, `sort`, `visible`, `status`, `created_at`, `updated_at`)
SELECT '01a1b1e5-7940-7000-8000-000000000002', `parent`.`id`, '访问分析', '/monitor/analysis', 10, true, 'active', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)
FROM `Menu` AS `parent`
WHERE `parent`.`path` IS NULL
  AND `parent`.`title` = 'GEO 监控'
  AND NOT EXISTS (SELECT 1 FROM `Menu` WHERE `path` = '/monitor/analysis')
ORDER BY `parent`.`id`
LIMIT 1;

UPDATE `Menu`
SET `parent_id` = (
      SELECT `id` FROM (
        SELECT `id` FROM `Menu` WHERE `path` IS NULL AND `title` = 'GEO 监控' ORDER BY `id` LIMIT 1
      ) AS `geo_parent`
    ),
    `title` = '访问记录',
    `sort` = 20,
    `updated_at` = CURRENT_TIMESTAMP(0)
WHERE `path` = '/monitor'
  AND (
    `title` <> '访问记录'
    OR `sort` <> 20
    OR `parent_id` IS NULL
    OR `parent_id` <> (
      SELECT `id` FROM (
        SELECT `id` FROM `Menu` WHERE `path` IS NULL AND `title` = 'GEO 监控' ORDER BY `id` LIMIT 1
      ) AS `geo_parent`
    )
  );

COMMIT;
