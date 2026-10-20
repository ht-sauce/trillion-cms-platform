#!/usr/bin/env node
/**
 * 部署包打包器：把三端产物 + 依赖 + 派生配置汇集为仓库根 deploy/（ADR-042）
 *
 * 三个脚本与部署的分工：
 * - `scripts/release.mjs`（上线器）：源码仓库形态的体检 + 构建（服务器需 git / pnpm）
 * - `scripts/pm2-config.mjs`（PM2 配置生成器）：源码仓库形态的进程守护
 * - 本文件 + `scripts/deploy-runtime/`（部署包形态）：本地打包 → 整体拷贝 → 服务器 `node start.mjs` 一条命令运行，
 *   服务器免 git / pnpm / PM2（操作口径见 docs/spec/10-launch-runbook.md §4.0）
 *
 * 用法：
 *   pnpm pack:deploy                 # 打包 production（缺省）
 *   pnpm pack:deploy --env test     # 打包指定环境
 *   node scripts/pack-deploy.mjs --help
 *
 * 流程（任一步失败即中止，deploy/ 保持上次成功状态不动）：
 *   1) 体检：三端产物 + shared dist 齐备（缺失提示先 pnpm release --build-only）
 *   2) 拷贝 config/ 与 env/.env.<环境>（含密钥）+ 运行时模板（start.mjs / db.mjs / README / nginx）
 *   3) `pnpm deploy --node-linker=hoisted` 汇集 server / geo（零 symlink，跨机拷贝不断链），按白名单清掉开发期文件
 *   4) admin 直接拷 .output（Nitro 自包含）
 *   5) 校验关键文件清单 → 输出大小与拷贝提示
 *
 * 产物（仓库根 deploy/，已 gitignore——含数据库口令与 JWT 密钥，禁止入库或外传）：
 *   deploy/start.mjs  db.mjs  README.md  nginx.conf.example  .deploy-env
 *   deploy/config/  deploy/env/.env.<环境>
 *   deploy/apps/server/{dist, prisma, node_modules, uploads, package.json}
 *   deploy/apps/admin/.output/
 *   deploy/apps/geo/{app, public, scripts, server, nuxt.config.ts, package.json, node_modules, .output, sites, .<slug>.build}
 */
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REPO_ROOT, SHARED_PACKAGE, loadConfig } from '../config/index.mjs'
import { spawnPnpm } from './pnpm.mjs'

/** 日志前缀 */
const TAG = '部署包'

/** 输出目录（仓库根 deploy/；已 gitignore） */
const OUTPUT_DIR = 'deploy'

/** 运行时模板目录（随包拷到 deploy/ 根：start.mjs / db.mjs / README.md / nginx.conf.example） */
const RUNTIME_DIR = path.join('scripts', 'deploy-runtime')

/** 打包环境名标记（写进包根，start.mjs / db.mjs 据此确定缺省环境） */
const ENV_MARKER = '.deploy-env'

/**
 * pnpm deploy 输出的白名单清理清单：只保留运行必需项，其余（开发期源码、临时脚本、
 * lockfile、pnpm-workspace.yaml、eslint/tsconfig 等）一律删除——新增垃圾文件不会漏删。
 * `.*.build` 为通配模式（geo 各站点的构建缓存，目录名形如 .<slug>.build）。
 */
const KEEP = {
  server: ['dist', 'prisma', 'node_modules', 'uploads', 'package.json'],
  geo: [
    'app',
    'public',
    'scripts',
    'server',
    'nuxt.config.ts',
    'package.json',
    'node_modules',
    '.output',
    'sites',
    '.*.build'
  ]
}

/** 白名单通配匹配：'foo' 精确名；'*.build' 前后缀通配 */
function matchPattern(name, pattern) {
  if (!pattern.includes('*')) return name === pattern
  const [head, tail] = pattern.split('*')
  return name.startsWith(head) && name.endsWith(tail)
}

/** 打印用法并退出 */
function usage() {
  console.log(
    [
      '用法：node scripts/pack-deploy.mjs [--env <环境>]',
      '',
      '  --env    目标环境，决定拷贝 env/.env.<环境> 并按其派生（缺省 production）',
      '',
      `输出：仓库根 ${OUTPUT_DIR}/（自包含部署包，含密钥：不入库、谨慎拷贝）`,
      '前置：pnpm release --env <环境> --build-only（三端产物 + shared dist）',
      '之后：整体压缩拷到服务器 → node db.mjs deploy → node start.mjs daemon（见部署包内 README.md）'
    ].join('\n')
  )
}

/** 解析命令行：`--env <name>` / `--env=<name>` / `--help` */
function parseArgs(argv) {
  let appEnv
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--env') {
      appEnv = argv[index + 1]
      index += 1
      continue
    }
    if (arg.startsWith('--env=')) {
      appEnv = arg.slice('--env='.length)
      continue
    }
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    console.error(`[${TAG}] 无法识别的参数：${arg}（本命令只接受 --env 与 --help）`)
    process.exit(1)
  }
  return { appEnv }
}

/** 递归统计目录大小（字节） */
function dirSize(target) {
  let total = 0
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) total += dirSize(full)
    else total += fs.statSync(full).size
  }
  return total
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

/** 递归拷贝目录（目标不存在则创建） */
function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

/** 执行 pnpm deploy 并等待结束（子进程输出直接继承到当前终端） */
function runPnpmDeploy(packageName, target) {
  return new Promise((resolve, reject) => {
    const child = spawnPnpm(['--filter', packageName, 'deploy', '--node-linker=hoisted', target], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

/** 按白名单清理 pnpm deploy 输出（保留运行必需项，其余删除） */
function keepOnly(dir, patterns) {
  const removed = []
  for (const entry of fs.readdirSync(dir)) {
    if (patterns.some((pattern) => matchPattern(entry, pattern))) continue
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
    removed.push(entry)
  }
  return removed
}

/**
 * 在部署包内执行 prisma generate：node_modules/.prisma/client 是 prisma generate 的机器产物，
 * deploy 的 @prisma/client postinstall 不会按多文件 schema（prisma/schema/）重新生成，
 * 缺了它服务端启动即报 "@prisma/client did not initialize yet"——服务器上无需（也无法）重新生成，
 * 必须在打包时随包做好。
 */
function runPrismaGenerate(target) {
  return new Promise((resolve, reject) => {
    const prismaCli = path.join(target, 'node_modules', 'prisma', 'build', 'index.js')
    if (!fs.existsSync(prismaCli)) {
      reject(new Error('部署包内未找到 prisma CLI（node_modules/prisma），无法生成 Prisma Client'))
      return
    }
    const child = spawn(process.execPath, [prismaCli, 'generate', '--schema=prisma/schema'], {
      cwd: target,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

/** 体检三端产物与 shared dist；缺失即阻断 */
function assertBuildOutputs() {
  const required = [
    [path.join('apps', 'server', 'dist', 'main.js'), 'pnpm build:server'],
    [path.join('apps', 'admin', '.output', 'server', 'index.mjs'), 'pnpm build:admin'],
    [path.join('apps', 'geo', '.output', 'server', 'index.mjs'), 'pnpm build:geo'],
    [path.join('packages', 'shared', 'dist'), `pnpm -F ${SHARED_PACKAGE} build`]
  ]
  const missing = required.filter(([relative]) => !fs.existsSync(path.join(REPO_ROOT, relative)))
  if (missing.length) {
    console.error(`[${TAG}] 产物缺失，无法打包：`)
    for (const [relative, fix] of missing) console.error(`  - ${relative.replace(/\\/g, '/')}（${fix}）`)
    console.error(`[${TAG}] 先执行 pnpm release --build-only 完成体检与构建，再重新打包`)
    process.exit(1)
  }
}

/** 打包完成后逐项校验关键文件；返回缺失清单 */
function verifyOutput(output, appEnv) {
  const checks = [
    'start.mjs',
    'db.mjs',
    'README.md',
    'nginx.conf.example',
    ENV_MARKER,
    path.join('config', 'index.mjs'),
    path.join('config', 'apps.mjs'),
    path.join('env', `.env.${appEnv}`),
    path.join('apps', 'server', 'dist', 'main.js'),
    path.join('apps', 'server', 'prisma', 'schema'),
    path.join('apps', 'server', 'node_modules', 'prisma', 'build', 'index.js'),
    path.join('apps', 'server', 'node_modules', '@trillion', 'shared', 'dist'),
    path.join('apps', 'admin', '.output', 'server', 'index.mjs'),
    path.join('apps', 'geo', '.output', 'server', 'index.mjs'),
    path.join('apps', 'geo', 'scripts', 'build-sites.mjs'),
    path.join('apps', 'geo', 'node_modules', 'nuxt', 'bin', 'nuxt.mjs'),
    path.join('apps', 'geo', 'node_modules', 'tsx', 'dist', 'cli.mjs')
  ]
  return checks.filter((relative) => !fs.existsSync(path.join(output, relative)))
}

async function main() {
  const { appEnv } = parseArgs(process.argv.slice(2))
  const config = loadConfig({ appEnv: appEnv ?? 'production' })
  const output = path.join(REPO_ROOT, OUTPUT_DIR)

  console.log('─'.repeat(72))
  console.log(`[${TAG}] 打包部署包（环境 ${config.appEnv}）`)
  console.log(`[${TAG}] 输出 ${OUTPUT_DIR}/（已有目录会清空重建）`)

  /** 1) 体检：产物齐备才动手（体检失败不动现有 deploy/） */
  assertBuildOutputs()

  /** 2) 清空重建骨架：config 派生逻辑 + env 值 + 运行时模板 */
  fs.rmSync(output, { recursive: true, force: true })
  fs.mkdirSync(output, { recursive: true })
  copyDir(path.join(REPO_ROOT, 'config'), path.join(output, 'config'))
  copyDir(path.join(REPO_ROOT, 'env', `.env.${config.appEnv}`), path.join(output, 'env', `.env.${config.appEnv}`))
  fs.writeFileSync(path.join(output, ENV_MARKER), `${config.appEnv}\n`, 'utf8')
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, RUNTIME_DIR))) {
    fs.cpSync(path.join(REPO_ROOT, RUNTIME_DIR, entry), path.join(output, entry))
  }

  /** 3) server / geo：pnpm deploy 产出零 symlink 自包含目录，再按白名单清理 */
  for (const name of ['server', 'geo']) {
    const appDir = path.join('apps', name)
    console.log(`\n[${TAG}] ▶ 收集 ${appDir}（pnpm deploy --node-linker=hoisted，需 1~2 分钟）…`)
    const target = path.join(output, appDir)
    const code = await runPnpmDeploy(`@trillion/${name}`, target)
    if (code !== 0) {
      console.error(`[${TAG}] ✗ pnpm deploy ${name} 失败（退出码 ${code}），已中止`)
      process.exit(code)
    }
    if (name === 'server') {
      console.log(`\n[${TAG}] ▶ 生成 Prisma Client（prisma generate，机器产物随包提供）…`)
      const genCode = await runPrismaGenerate(target)
      if (genCode !== 0) {
        console.error(`[${TAG}] ✗ prisma generate 失败（退出码 ${genCode}），已中止`)
        process.exit(genCode)
      }
    }
    const removed = keepOnly(target, KEEP[name])
    console.log(`[${TAG}] ✓ ${appDir} 完成（清理 ${removed.length} 项开发期文件：${removed.join('、')}）`)
  }

  /** 4) admin：只需 Nitro 自包含产物 */
  copyDir(path.join(REPO_ROOT, 'apps', 'admin', '.output'), path.join(output, 'apps', 'admin', '.output'))

  /** 5) 校验关键文件清单 */
  const missing = verifyOutput(output, config.appEnv)
  if (missing.length) {
    console.error(`\n[${TAG}] ✗ 打包校验失败，以下关键文件缺失：`)
    for (const relative of missing) console.error(`  - ${relative.replace(/\\/g, '/')}`)
    process.exit(1)
  }

  /** 收尾：大小摘要 + 拷贝提示 */
  const total = dirSize(output)
  const uploads = path.join(output, 'apps', 'server', 'uploads')
  const sitesDir = path.join(output, 'apps', 'geo', 'sites')
  const sites = fs
    .readdirSync(sitesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
  console.log('\n' + '─'.repeat(72))
  console.log(`[${TAG}] ✓ 部署包完成：${OUTPUT_DIR}/（${mb(total)}，环境 ${config.appEnv}）`)
  console.log(`[${TAG}]   站点产物：${sites.length ? sites.join('、') : '无（首次启动后由后台发布生成）'}`)
  if (fs.existsSync(uploads))
    console.log(`[${TAG}]   素材库：apps/server/uploads（${mb(dirSize(uploads))}，随包提供首次部署数据）`)
  console.log(`[${TAG}] 下一步（详见部署包内 README.md）：`)
  console.log(
    `[${TAG}]   压缩：tar -czf deploy.tar.gz ${OUTPUT_DIR}/  或  Compress-Archive -Path ${OUTPUT_DIR} -DestinationPath deploy.zip`
  )
  console.log(`[${TAG}]   服务器：解压 → node db.mjs deploy → node start.mjs daemon → node start.mjs status`)
  console.log(`[${TAG}] 安全提示：包内 env/ 含数据库口令与 JWT 密钥——禁止入库、谨慎传输与留存`)
  console.log('─'.repeat(72))
}

/** 仅在被直接执行时运行（便于被测试脚本引用） */
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[${TAG}] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
