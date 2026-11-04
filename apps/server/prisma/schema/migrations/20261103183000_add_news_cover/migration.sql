-- 新闻文章表新增封面图字段（素材库 publicUrl，/static/... 形态）
ALTER TABLE `NewsArticle` ADD COLUMN `cover` VARCHAR(300) NULL;
