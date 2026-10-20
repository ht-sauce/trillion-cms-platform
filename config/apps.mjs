/**
 * 应用清单（启动器 / 执行器 / 上线器共用）
 *
 * 字段说明：
 * - `name`：命令行短名（`pnpm allDev admin`）
 * - `packageName`：`pnpm --filter` 使用的包名
 * - `dir`：工程目录（相对仓库根）
 * - `title`：中文名（日志与摘要展示）
 * - `color`：启动器日志前缀配色（ANSI）
 * - `devScript` / `buildScript` / `startScript`：各工程 package.json 中的脚本名。
 *   三种形态各自取用，脚本名只在此声明一次：开发启动器取 `devScript`，
 *   上线器取 `buildScript`（构建）与 `startScript`（生产模式常驻）
 *
 * 端口不在此声明：统一由 `config/ports.mjs` 解析后作为 `PORT` 注入各进程
 */

/** 共享类型包（编译型，服务端与两个前端都依赖它，构建与上线时必须先构建） */
export const SHARED_PACKAGE = '@trillion/shared'

/** 应用启动顺序：服务端在前，前端依赖其 API */
export const APPS = [
  {
    name: 'server',
    packageName: '@trillion/server',
    dir: 'apps/server',
    title: '服务端',
    color: '\u001B[36m',
    devScript: 'dev',
    buildScript: 'build',
    startScript: 'start:prod'
  },
  {
    name: 'admin',
    packageName: '@trillion/admin',
    dir: 'apps/admin',
    title: '管理后台',
    color: '\u001B[35m',
    devScript: 'dev',
    buildScript: 'build',
    startScript: 'start:prod'
  },
  {
    name: 'geo',
    packageName: '@trillion/geo',
    dir: 'apps/geo',
    title: 'GEO 项目',
    color: '\u001B[32m',
    devScript: 'dev',
    buildScript: 'build',
    startScript: 'start:prod'
  }
]

export const APP_NAMES = APPS.map((app) => app.name)

/** ANSI 复位码，供启动器着色日志使用 */
export const COLOR_RESET = '\u001B[0m'

/** 按短名取应用定义，未知应用直接抛错并列出可选值 */
export function findApp(name) {
  const app = APPS.find((item) => item.name === name)
  if (!app) throw new Error(`未知应用：${name}（可选：${APP_NAMES.join(' / ')}）`)
  return app
}
