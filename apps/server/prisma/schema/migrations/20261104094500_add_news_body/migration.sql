-- 新闻文章表新增结构化正文块（段落 / 小标题 / 图片，ADR-053）
-- 历史数据 body 为 NULL：发布时回落到 content 纯文本按行分段
ALTER TABLE `NewsArticle` ADD COLUMN `body` JSON NULL;
