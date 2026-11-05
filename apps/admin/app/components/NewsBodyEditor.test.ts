import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.BROWSER_TEST_MODULE!)
let component = readFileSync(
  process.env.BODY_EDITOR_TEST_SOURCE || resolve('app/components/NewsBodyEditor.vue'),
  'utf8'
)
if (process.env.BODY_EDITOR_REVERSE === 'dimensions')
  component = component.replace("if (element.tagName === 'IMG') {", 'if (false) {')
if (process.env.BODY_EDITOR_REVERSE === 'styles')
  component = component.replace('Object.assign(node, { bodyStyle })', 'Object.assign({}, node, { bodyStyle })')
if (process.env.BODY_EDITOR_REVERSE === 'urls')
  component = component.replace('const resolved = resolveMediaUrl(prefix)', 'const resolved = prefix')
const moduleScript = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]
const setup = component.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]
const media = setup.slice(setup.indexOf('function resolveEditorMedia'), setup.indexOf('/** 初始 HTML'))
const script = ts.transpile(moduleScript.replace(/^import .*\n/gm, '') + media, { target: ts.ScriptTarget.ES2022 })

test('正文编辑后序列化保留图片尺寸、段落排版、文字样式与并排图片', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false })
  try {
    const page = await browser.newPage()
    await page.setContent('<div id="editor"></div>')
    await page.addScriptTag({ path: require.resolve('@wangeditor/editor/dist/index.js') })
    await page.addScriptTag({
      content: `const { Boot, SlateEditor, SlateText, SlateTransforms } = wangEditor;
      const resolveMediaUrl = value => value.startsWith('/static/') ? 'http://localhost/static/' + value.slice(8) : value.startsWith('/assets/') ? 'http://localhost/assets/' + value.slice(8) : value;
      ${script}
      window.roundTrip = raw => {
        const editor = wangEditor.createEditor({ selector: '#editor', config: { autoFocus: false } });
        bodyEditors.add(editor);
        editor.setHtml(resolveEditorMedia(raw));
        editor.history.undos = []; editor.history.redos = [];
        const before = serializeEditorMedia(editor.getHtml());
        editor.select([1, 0]);
        editor.insertText('修改');
        const edited = serializeEditorMedia(editor.getHtml());
        editor.undo();
        const undone = serializeEditorMedia(editor.getHtml());
        if (undone !== before) throw new Error('撤销未恢复原内容');
        editor.setHtml(resolveEditorMedia(undone));
        const html = serializeEditorMedia(editor.getHtml());
        editor.destroy();
        const root = document.createElement('div'); root.innerHTML = html;
        return { html, edited, before, images: Array.from(root.querySelectorAll('img')).map(i => ({ width: i.style.width || i.getAttribute('width'), height: i.style.height || i.getAttribute('height') })),
          heading: root.querySelector('h2')?.style.lineHeight, alignment: root.querySelectorAll('p')[1]?.style.textAlign,
          imageGroups: Array.from(root.querySelectorAll('p')).map(p => p.querySelectorAll('img').length) };
      };`
    })
    const result = await page.evaluate(() =>
      (window as any).roundTrip(
        '<p><img src="/static/a.jpg" width="535" height="402"><img src="/static/b.jpg" width="536" height="402"></p>' +
          '<h2 style="font-size:24px;line-height:1.6em">标题</h2><p style="text-align:center;margin-bottom:16px;font-size:14px">正文</p>'
      )
    )
    assert.deepEqual(result.images, [
      { width: '535px', height: '402px' },
      { width: '536px', height: '402px' }
    ])
    assert.match(result.html, /src="\/static\/a.jpg"/)
    assert.doesNotMatch(result.html, /http:\/\/localhost/)
    assert.equal(result.heading, '1.6em')
    assert.equal(result.alignment, 'center')
    assert.match(result.edited, /修改/)
    assert.doesNotMatch(result.html, /修改/)
    assert.equal(result.html, result.before)
    assert.match(result.html, /margin-bottom:\s*16px/)
    assert.match(result.html, /font-size:\s*14px/)
    assert.equal(result.imageGroups[0], 2)
    const mediaResult = await page.evaluate(() =>
      (window as any).serializeEditorMedia(
        '<video src="http://localhost/static/a.mp4?x=1" poster="http://localhost/assets/poster.jpg"><source src="http://localhost/assets/b.webm"></video>' +
          '<img src="https://cdn.example/static/external.jpg"><img src="http://localhost.evil/static/a.jpg">'
      )
    )
    assert.match(mediaResult, /src="\/static\/a.mp4\?x=1"/)
    assert.match(mediaResult, /poster="\/assets\/poster.jpg"/)
    assert.match(mediaResult, /src="\/assets\/b.webm"/)
    assert.match(mediaResult, /https:\/\/cdn.example\/static\/external.jpg/)
    assert.match(mediaResult, /http:\/\/localhost.evil\/static\/a.jpg/)
  } finally {
    await browser.close()
  }
})
