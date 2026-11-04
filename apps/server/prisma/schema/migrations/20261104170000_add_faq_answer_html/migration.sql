-- 问答答案改为「受限富文本」存储（ADR-058）
-- 背景：原站答案在页面上是纯文本（连 <p> 都没有），「1. 2. 3.」是正文里的字符，
--       前台只能整段铺开，读起来全糅在一起。answer 列继续存去标签后的纯文本（JSON-LD / 搜索用），
--       answer_html 存白名单化后的结构化富文本（段落 / 有序无序列表 / 加粗斜体下划线删除线）。
ALTER TABLE `FaqItem` ADD COLUMN `answer_html` TEXT NULL AFTER `answer`;
