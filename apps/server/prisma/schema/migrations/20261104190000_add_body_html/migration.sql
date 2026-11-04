-- 正文主数据改为整篇 HTML（ADR-060）
-- NewsArticle.bodyHtml：新闻正文整篇 HTML（可空，历史数据回落 body 块数组 / content 纯文本）
-- CaseStudy.bodyHtml：案例正文整篇 HTML（可空，历史数据回落 bodyBlocks / body 纯文本）
-- 纯文本列 content / body 保留并由 HTML 去标签派生，GEO 取文与检索口径不变；无自增列（ADR-043）
ALTER TABLE `NewsArticle` ADD COLUMN `body_html` TEXT NULL;
ALTER TABLE `CaseStudy` ADD COLUMN `body_html` TEXT NULL;
