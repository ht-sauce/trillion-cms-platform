#!/usr/bin/env node
/**
 * 素材库上传（ADR-037 轨 1 对账）：把 `apps/geo/public/assets/img/**` 的 60 张图
 * 以 siteId=3（xian-renai-skin）上传进 CMS 素材库（static_files）。
 *
 * 背景：站点图片走双轨 —— ① 素材库存档（管理后台可查可复用）；
 *       ② `public/assets/img/` 直出（SSG 构建 1:1 还原用）。
 * 本脚本做轨 ①，并在结尾对账：素材库 URL 文件名集合 vs 磁盘文件名集合应一致。
 *
 * 幂等：按返回的 url（/static/<目录>/<文件名>）判定已存在则跳过。
 * 用法：node scripts/upload-site-assets.mjs [--site 3]
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imgDir = path.join(root, 'apps', 'geo', 'public', 'assets', 'img')
const apiBase = process.env.API_BASE || 'http://localhost:3001/geoserver'
const siteId = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : '3'
const username = process.env.BOOTSTRAP_ADMIN_USER || 'admin'
const password = process.env.BOOTSTRAP_ADMIN_PASS || 'admin123456'

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    throw new Error(`${options.method || 'GET'} ${url} -> ${response.status} ${JSON.stringify(payload).slice(0, 200)}`)
  }
  return payload.data !== undefined ? payload.data : payload
}

// ---------- 登录 ----------
const login = await jsonFetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password })
})
const token = login.token || login.accessToken
if (!token) throw new Error('登录成功但未返回 token：' + JSON.stringify(login).slice(0, 200))
console.log(`[assets] 已登录 ${username}`)

// ---------- 现有清单（翻页拉全量；按 originalName 判重） ----------
// 服务端 pageSize 上限 20，需按 page 递增翻页
async function fetchAllFiles() {
  const all = []
  for (let page = 1; ; page += 1) {
    const data = await jsonFetch(`${apiBase}/files?siteId=${siteId}&page=${page}&pageSize=100`, {
      headers: { authorization: `Bearer ${token}` }
    })
    const items = data.items || data.list || []
    all.push(...items)
    const total = Number(data.total ?? all.length)
    if (all.length >= total || items.length === 0) break
  }
  return all
}
const existing = await fetchAllFiles()
const existingNames = new Set(existing.map((item) => item.originalName))
console.log(`[assets] 素材库已有 ${existingNames.size} 条记录`)
// 注：素材库按 uploads/<年>/<月>/<uuid> 归档（publicUrl 为 uuid 路径），与站点静态轨
// /static/<dir>/<name> 是 ADR-037 预期的双轨差异；对账以 originalName 为准。

// ---------- 收集磁盘文件 ----------
const files = []
for (const dir of fs.readdirSync(imgDir)) {
  const full = path.join(imgDir, dir)
  if (!fs.statSync(full).isDirectory()) continue
  for (const name of fs.readdirSync(full)) {
    if (/\.(jpg|jpeg|png|webp|pdf)$/i.test(name)) files.push({ dir, name, full: path.join(full, name) })
  }
}
console.log(`[assets] 磁盘待传 ${files.length} 个文件`)

// ---------- 逐个上传 ----------
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
}
let uploaded = 0
let skipped = 0
const uploadedUrls = new Set()
for (const file of files) {
  const expected = `/static/${file.dir}/${file.name}`
  uploadedUrls.add(expected)
  if (existingNames.has(file.name)) {
    skipped += 1
    continue
  }
  const ext = path.extname(file.name).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(file.full)], { type: mime }), file.name)
  form.append('siteId', siteId)
  try {
    const result = await jsonFetch(`${apiBase}/files/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form
    })
    const url = result.url || result.path || ''
    if (url && url !== expected) {
      console.warn(`  ⚠ ${expected} 上传后 URL 为 ${url}（目录归位不一致）`)
    }
    uploaded += 1
  } catch (error) {
    console.error(`  ✗ ${file.dir}/${file.name}：${error.message}`)
  }
}

// ---------- 对账（ADR-037）：磁盘文件名集合 vs 素材库 originalName 集合 ----------
const after = await fetchAllFiles()
const afterNames = new Set(after.map((item) => item.originalName))
const missingInCms = files.filter((file) => !afterNames.has(file.name)).map((file) => `${file.dir}/${file.name}`)
console.log(`\n[assets] 完成：上传 ${uploaded} · 已存在跳过 ${skipped}`)
console.log(`[assets] 对账：磁盘 ${files.length} 个 / 素材库现有 ${afterNames.size} 条`)
if (missingInCms.length === 0 && afterNames.size >= files.length) {
  console.log('[assets] ✓ 双轨一致：磁盘文件与素材库记录一一对应（originalName）')
} else {
  console.warn(`[assets] 差异 ${missingInCms.length} 条（上传失败或重名覆盖，需人工核查）：`)
  for (const url of missingInCms) console.warn(`  - ${url}`)
}
