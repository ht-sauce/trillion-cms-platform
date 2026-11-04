import { plainTextToFaqHtml, faqAnswerHtmlToText, sanitizeFaqAnswerHtml } from './src/common/utils/faq-answer'

const samples = [
  '1. 颜色聚氨酯砂浆 (PU) 提供多种颜色选择，以满足不同设计和功能需求：标准色调：中性色如灰色、米色和白色。2. 表面处理为了提升功能性和美观性，聚氨酯砂浆 (PU) 提供多种表面处理选项：光滑表面。3. 为什么选择聚氨酯砂浆 (PU)？结合了耐用性。',
  '我们的产品厚度范围从2毫米到10毫米以上。通常，我们建议地坪厚度为2-4mm，适合大多数工业场景，但如果需要更厚的地坪，我们也可以进行定制。',
  'PU自流平地坪的成本会受到多种因素的影响，包括：层厚： 层越厚，成本越高。面积： 面积越小，每平方米的成本可能越高。'
]

for (const [index, text] of samples.entries()) {
  const html = plainTextToFaqHtml(text)
  console.log(`\n--- 样本 ${index + 1} ---`)
  console.log('HTML:', html.slice(0, 300))
  console.log('回读文本:', faqAnswerHtmlToText(html).slice(0, 120).replace(/\n/g, '⏎'))
}

/** 安全检查：脚本标签与属性必须被清掉 */
console.log('\nXSS:', sanitizeFaqAnswerHtml('<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:1">b</a>'))
