#!/usr/bin/env node
/**
 * 建站描述导入 CLI（09 §12.2）
 *
 * 输入是一份可评审、可重放的建站描述 JSON（站点档案 + 目录树 + 页面与块 + 导航），
 * 输出是数据库里一个真实站点。之所以做成「描述文件 + 导入器」而不是后台手点：
 *   1. 描述文件能进评审——NAP 写错、资质占位是否合理，一眼可见；
 *   2. 幂等可重放——改完再导一次即可，不产生重复页面与块；
 *   3. 换站点只需换描述文件，不必重写录入流程。
 *
 * 用法：
 *   node scripts/bootstrap-site.mjs [选项]
 *     --file <路径>   建站描述 JSON（**必填**，不提供缺省值）
 *     --user <账号>   后台账号（缺省取 env 的 BOOTSTRAP_ADMIN_USER，再缺省 admin）
 *     --pass <密码>   后台密码（缺省取 env 的 BOOTSTRAP_ADMIN_PASS，再缺省 admin123456）
 *     --publish       导入后立刻入队整站构建（默认否，交由人工在后台确认发布）
 *     --env <环境>    取 development / test / production（缺省 development）
 *
 * 前置：服务端必须已启动（`pnpm dev:server`），且已执行过 `pnpm db:migrate` 与 `pnpm db:seed`。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAppEnv, loadConfig } from '../config/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 解析命令行选项（--key value 形式，布尔选项单独列出） */
function parseOptions(argv) {
  const options = { flags: new Set() }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      options.flags.add(key)
      continue
    }
    options[key] = next
    index += 1
  }
  return options
}

const options = parseOptions(process.argv.slice(2))
const appEnv = options.env || process.env.APP_ENV || 'development'
const config = loadConfig({ appEnv })
const env = buildAppEnv(config, 'server')
const apiBase = config.urls.apiBase

if (!options.file) {
  console.error('[bootstrap] 必须用 --file 指定建站描述 JSON')
  process.exit(1)
}
const file = path.resolve(root, options.file)
if (!fs.existsSync(file)) {
  console.error(`[bootstrap] 描述文件不存在：${file}`)
  process.exit(1)
}

const username = options.user || env.BOOTSTRAP_ADMIN_USER || 'admin'
const password = options.pass || env.BOOTSTRAP_ADMIN_PASS || 'admin123456'

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!response.ok) {
    const message = payload?.message ?? (typeof payload === 'string' ? payload : response.statusText)
    throw new Error(
      `${init.method || 'GET'} ${url} -> ${response.status} ${Array.isArray(message) ? message.join('; ') : message}`
    )
  }
  return payload
}

const login = await request(`${apiBase}/auth/login`, {
  method: 'POST',
  body: JSON.stringify({ username, password })
})
const token = login?.data?.accessToken ?? login?.accessToken ?? login?.data?.token
if (!token) {
  console.error('[bootstrap] 登录未返回令牌，请检查账号密码')
  process.exit(1)
}

const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
if (options.flags.has('publish')) doc.publish = true

console.log(`[bootstrap] 环境 ${config.appEnv} → ${apiBase}`)
console.log(
  `[bootstrap] 导入 ${path.relative(root, file)}：目录 ${doc.channels?.length ?? 0} · 页面 ${doc.pages?.length ?? 0} · 导航 ${doc.navigations?.length ?? 0} 组`
)

const result = await request(`${apiBase}/sites/bootstrap`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify(doc)
})

const data = result?.data ?? result
console.log(
  `[bootstrap] 完成：siteId=${data.siteId} slug=${data.slug} 目录(新建 ${data.channels?.created} / 更新 ${data.channels?.updated}) 页面(新建 ${data.pages?.created} / 更新 ${data.pages?.updated}) 导航 ${data.navigations} 组`
)
if (data.publishTaskId) console.log(`[bootstrap] 已入队整站构建：任务 ${data.publishTaskId}`)
else console.log('[bootstrap] 未自动发布（如需发布请加 --publish，或到后台站点列表手动发布）')
