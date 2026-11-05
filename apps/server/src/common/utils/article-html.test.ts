import assert from 'node:assert/strict'
import { test } from 'node:test'
import { articleBlocksToHtml, htmlToText, sanitizeArticleHtml } from './article-html'

function assertStable(input: string, expected: string): void {
  const actual = sanitizeArticleHtml(input)
  assert.equal(actual, expected)
  assert.equal(sanitizeArticleHtml(actual), actual)
  assert.equal(sanitizeArticleHtml(sanitizeArticleHtml(actual)), actual)
}

test('正文实体不重复转义，裸字符仍转义且保存幂等', () => {
  assertStable(
    '<p>A &amp; B&nbsp;&lt;script&gt; &quot;引号&quot; &#39; &#160; &#x1F600; &copy; & 裸字符</p>',
    '<p>A &amp; B&nbsp;&lt;script&gt; &quot;引号&quot; &#39; &#160; &#x1F600; &copy; &amp; 裸字符</p>'
  )
  assert.equal(htmlToText(sanitizeArticleHtml('<p>A &amp; B&nbsp;&lt;文本&gt;</p>')), 'A & B <文本>')
})

test('属性中的实体解码后校验并重新转义，查询参数与引号不累积转义', () => {
  assertStable(
    '<a href="https://example.com/?a=1&amp;b=2" title="A &quot;B&quot; &amp; C">链接</a>' +
      '<img src="/static/a.png?x=1&#38;y=2" alt="&lt;图片&gt; &quot;名称&quot;">',
    '<a href="https://example.com/?a=1&amp;b=2" title="A &quot;B&quot; &amp; C">链接</a>' +
      '<img src="/static/a.png?x=1&amp;y=2" alt="&lt;图片&gt; &quot;名称&quot;">'
  )
})

test('wangEditor 视频包装、source 和尺寸在保存后保留', () => {
  assertStable(
    '<div data-w-e-type="video" data-w-e-is-void><video poster="/assets/poster.png" controls="true" ' +
      'width="auto" height="360"><source src="https://example.com/video.mp4?a=1&amp;b=2" type="video/mp4"/>' +
      '</video></div>',
    '<div data-w-e-type="video" data-w-e-is-void><video poster="/assets/poster.png" controls ' +
      'width="auto" height="360"><source src="https://example.com/video.mp4?a=1&amp;b=2" type="video/mp4">' +
      '</video></div>'
  )
})

test('wangEditor 图片标记与表格布局、合并单元格属性在保存后保留', () => {
  assertStable(
    '<img data-w-e-type="image" data-w-e-is-void data-w-e-is-inline src="/static/a.png" width="320">' +
      '<table data-w-e-type="table" border="1" width="100%" cellpadding="4" cellspacing="0">' +
      '<tbody><tr><th colspan="2" rowspan="1" width="50%">表头</th></tr>' +
      '<tr><td colspan="1" rowspan="2" height="40">数据</td></tr></tbody></table>',
    '<img data-w-e-type="image" data-w-e-is-void data-w-e-is-inline src="/static/a.png" width="320">' +
      '<table data-w-e-type="table" border="1" width="100%" cellpadding="4" cellspacing="0">' +
      '<tbody><tr><th colspan="2" rowspan="1" width="50%">表头</th></tr>' +
      '<tr><td colspan="1" rowspan="2" height="40">数据</td></tr></tbody></table>'
  )
})

test('扩展白名单不放行事件、任意 data 属性、危险尺寸或 MIME', () => {
  assertStable(
    '<div data-w-e-type="evil" data-w-e-is-void="evil" data-w-e-custom="x" onclick="alert(1)">' +
      '<video width="expression(alert(1))" height="-1" onplay="alert(1)">' +
      '<source src="javascript:alert(1)" type="text/html" onerror="alert(1)"></video>' +
      '<table border="x" cellpadding="-1" cellspacing="url(x)" width="expression(x)">' +
      '<tr><td colspan="0" rowspan="-1" onclick="x">安全</td></tr></table></div>',
    '<div><video><source></video><table><tr><td>安全</td></tr></table></div>'
  )
})

test('实体编码的危险地址仍被拒绝，属性引号不能注入事件', () => {
  assertStable(
    '<a href="&#106;avascript:alert(1)">a</a><img src="&#100;ata:image/png;base64,x">' +
      '<video poster="vbscript:1"><source src="javascript&#58;alert(1)"></video>' +
      '<img src="/static/a.png&quot; onerror=&quot;alert(1)" alt="&#34; onload=&#34;x">',
    '<a>a</a><img><video><source></video>' +
      '<img src="/static/a.png&quot; onerror=&quot;alert(1)" alt="&quot; onload=&quot;x">'
  )
})

test('地址白名单与 H1 降级、脚本及样式清洗保持不变', () => {
  assertStable(
    '<h1 onclick="x">标题</h1><h5>次级</h5><script>alert(1)</script><style>body{display:none}</style>' +
      '<p style="text-align:center;position:fixed;background-image:url(x)">正文</p>' +
      '<img src="/static/a.png"><img src="/assets/a.png"><img src="http://example.com/a.png">' +
      '<img src="https://example.com/a.png"><img src="//example.com/a.png"><img src="/other/a.png">' +
      '<a href="/news/a">站内</a><a href="#part">锚点</a><a href="data:text/html,x">禁止</a>',
    '<h2>标题</h2><h4>次级</h4><p style="text-align:center">正文</p>' +
      '<img src="/static/a.png"><img src="/assets/a.png"><img src="http://example.com/a.png">' +
      '<img src="https://example.com/a.png"><img><img>' +
      '<a href="/news/a">站内</a><a href="#part">锚点</a><a>禁止</a>'
  )
})

test('历史块的纯文本仍按文本转义，不将实体字符串解释成 HTML', () => {
  const html = articleBlocksToHtml([{ kind: 'paragraph', text: '&amp; <script>文本</script>' }])
  assert.equal(html, '<p>&amp;amp; &lt;script&gt;文本&lt;/script&gt;</p>')
  assertStable(html, html)
})
