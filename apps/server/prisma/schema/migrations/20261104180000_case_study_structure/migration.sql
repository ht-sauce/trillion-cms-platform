-- 工程案例结构补齐（repair-case-studies-module）
-- industry_id：行业改为关联 ProductIndustry 的分类数据；industry 保留为名称快照
-- client：业主；system_note：使用体系副项；body_blocks：与新闻同口径的结构化正文；source_url：抓取来源页
-- 全部为可空或带默认值，存量行无需回填即可读；无自增列（ADR-043）
ALTER TABLE `CaseStudy` ADD COLUMN `industry_id` VARCHAR(36) NULL;
ALTER TABLE `CaseStudy` ADD COLUMN `client` VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE `CaseStudy` ADD COLUMN `system_note` VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE `CaseStudy` ADD COLUMN `body_blocks` JSON NULL;
ALTER TABLE `CaseStudy` ADD COLUMN `source_url` VARCHAR(300) NOT NULL DEFAULT '';

CREATE INDEX `CaseStudy_site_id_industry_id_idx` ON `CaseStudy`(`site_id`, `industry_id`);
