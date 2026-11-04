-- 素材库新增「上传来源」字段（哪个功能 / 哪个页面传上来的）
ALTER TABLE `StaticFile` ADD COLUMN `source` VARCHAR(160) NULL;
