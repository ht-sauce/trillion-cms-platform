-- 问答「上架展示」开关（ADR-055）
-- 背景：问答列表页的分类区块与全部问题列表会把该分类下所有问答铺开，
--       条目超过百余条后页面结构失控；featured=0 的问答只保留详情页（页面仍可访问、仍在 sitemap），
--       不再进入列表页的分类区块与全部问题列表。
-- 默认 1：存量数据行为与改动前完全一致，需要收敛时由运营逐条关闭。
ALTER TABLE `FaqItem` ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT true;
