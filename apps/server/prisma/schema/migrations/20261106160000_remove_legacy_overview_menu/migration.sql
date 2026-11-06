START TRANSACTION;

DELETE `grant`
FROM `RoleMenu` AS `grant`
INNER JOIN `Menu` AS `menu` ON `grant`.`menu_id` = `menu`.`id`
WHERE `menu`.`path` = '/';

DELETE FROM `Menu` WHERE `path` = '/';

COMMIT;
