-- 问答「关联问题」手工指定（ADR-057）
-- 背景：详情页的「关联问题」原来是「同分类其它问答前 8 条」自动取，
--       运营没法决定露出哪几条（短答分类里可能一条都不相关）。
--       本列存 FaqItem id 数组（按顺序渲染），为空＝沿用自动口径。
ALTER TABLE `FaqItem` ADD COLUMN `related_ids` JSON NULL;
