INSERT INTO `Menu` (`id`, `parent_id`, `title`, `path`, `sort`, `visible`, `status`, `created_at`, `updated_at`)
SELECT '01a1b140-ae00-7000-8000-000000000001', `parent`.`id`, '需求收集', '/sites/demands', 40, true, 'active', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)
FROM `Menu` AS `parent`
WHERE `parent`.`parent_id` IS NULL
  AND `parent`.`path` IS NULL
  AND `parent`.`title` = '站点管理'
  AND NOT EXISTS (SELECT 1 FROM `Menu` WHERE `path` = '/sites/demands')
ORDER BY `parent`.`id`
LIMIT 1;
