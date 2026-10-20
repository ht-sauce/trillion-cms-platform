#!/usr/bin/env node
/**
 * 包脚本执行器：以全局配置注入环境变量后执行某个工程的 package.json 脚本
 *
 * 背景：环境变量已统一收敛到仓库根 `env/`，各工程不再自带 `.env`；
 *      数据库迁移、SSG 构建这类脱离启动器的命令，同样需要拿到 DB / API 配置，故统一走本执行器。
 *
 * 用法：
 *   node scripts/exec.mjs <应用> <脚本名> [...透传参数]
 *   例：node scripts/exec.mjs server prisma:migrate
 *       node scripts/exec.mjs geo build:sites --site star-tech
 *       node scripts/exec.mjs admin build --env production
 */
import { buildAppEnv, findApp, loadConfig } from '../config/index.mjs'
import { spawnPnpm } from './pnpm.mjs'

/** 剥离 --env 选项，其余参数按 [应用, 脚本名, ...透传参数] 处理 */
function parseArgs(argv) {
  let appEnv
  const rest = []
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
    rest.push(arg)
  }
  return { appEnv, appName: rest[0], script: rest[1], scriptArgs: rest.slice(2) }
}

const { appEnv, appName, script, scriptArgs } = parseArgs(process.argv.slice(2))

if (!appName || !script) {
  console.error('用法：node scripts/exec.mjs <应用> <脚本名> [...透传参数]')
  console.error('  例：node scripts/exec.mjs server prisma:migrate')
  process.exit(1)
}

const app = findApp(appName)
const config = loadConfig({ appEnv })
/** 透传参数直接跟在脚本名之后：pnpm 会原样转发，若插入 `--` 会被当作参数值传给脚本 */
const args = ['--filter', app.packageName, script, ...scriptArgs]

console.log(`[执行器] 环境 ${config.appEnv}（${config.envFile}）→ ${app.packageName} ${script}`)

const child = spawnPnpm(args, {
  cwd: config.root,
  env: buildAppEnv(config, appName),
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error(`[执行器] 执行失败：${error.message}`)
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 0))
