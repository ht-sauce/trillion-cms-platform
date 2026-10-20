# trillion-cms-platform 部署包

自包含部署包（ADR-042）：包含三端运行产物、全部依赖（零 symlink）、派生配置与环境变量。
服务器只需要 **Node 20+、MySQL 8、nginx**——无需 git、pnpm、PM2，也无需执行任何 install / build。

> 本包含数据库口令与 JWT 密钥（`env/` 内），请勿提交到代码仓库或公开传播。

## 目录结构

```
start.mjs              进程入口（清单驱动，管理全部应用）
db.mjs                 数据库入口（结构上线 / 状态 / 种子）
nginx.conf.example     nginx 参考配置（单域名同源）
config/                派生配置（端口 / API 基址 / 连接串的唯一事实源）
env/                   环境变量值（含密钥）
apps/server/           服务端：dist + prisma 迁移 + uploads 素材 + 全量 node_modules
apps/admin/.output/    管理后台：Nitro 自包含产物
apps/geo/              GEO 项目：源码 + nuxt 工具链 + .output + sites/<slug>/ SSG 产物
```

## 首次部署

```bash
node db.mjs deploy          # 1) 数据库上线：增量应用迁移（空库自动建库；唯一的改结构入口）
node db.mjs seed            # 2) 可选：初始化管理员与示例站点（仅首次）
node start.mjs daemon       # 3) 后台守护运行三端
node start.mjs status       # 4) 查看健康（三端端口应有 HTTP 响应）
```

之后按 `nginx.conf.example` 配置反向代理与静态托管，即可对外访问。

## 常用命令

| 命令                     | 作用                                                  |
| ------------------------ | ----------------------------------------------------- |
| `node start.mjs`         | 前台运行（Ctrl+C 结束；SSH 断开即退出，仅调试用）     |
| `node start.mjs daemon`  | 后台守护运行（崩溃自动重启：间隔 4s、连续 10 次上限） |
| `node start.mjs status`  | 守护进程 + 各应用端口健康                             |
| `node start.mjs restart` | 重启后台守护（改 env 后用它生效）                     |
| `node start.mjs stop`    | 结束后台守护与全部子进程                              |
| `node db.mjs status`     | 只读查看迁移状态                                      |
| `node db.mjs deploy`     | 增量应用迁移（结构变更唯一入口；先库后码）            |

日志：`logs/<应用>-out.log` 与 `-error.log`（后台模式）；守护自身事件在 `logs/daemon.log`。

## 端口与应用

| 应用     | 端口 | 入口脚本                                                        |
| -------- | ---- | --------------------------------------------------------------- |
| 服务端   | 3001 | `apps/server/dist/main.js`                                      |
| 管理后台 | 3000 | `apps/admin/.output/server/index.mjs`（挂 `/geocms/` 基础路径） |
| GEO 项目 | 3002 | `apps/geo/.output/server/index.mjs`（SSR 预览 + 发布构建）      |

端口由 `env/.env.<环境>` 与 `config/` 派生，应用清单在 `config/apps.mjs`——改配置后 `node start.mjs restart` 生效。

## 内容发布（无需服务器操作）

后台改内容保存后，服务端自动调用包内 `apps/geo/scripts/build-sites.mjs` 增量重建对应页面，
产物写入 `apps/geo/sites/<slug>/`——nginx 直接出静态文件，无需重启任何进程。

## 代码更新

本地重新构建打包（`pnpm release:prod --build-only && pnpm pack:deploy`）后整体覆盖本目录：

1. `node start.mjs stop`（先停）
2. 有结构变更时：解压覆盖后 `node db.mjs deploy`（先库后码）
3. 服务器侧 `apps/server/uploads/` 有新增素材时，覆盖前先备份该目录，覆盖后还原
4. `node start.mjs daemon` 重新拉起

## 故障排查

| 现象                  | 处理                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| 某端反复重启后放弃    | 看 `logs/<应用>-err.log`；常见为端口被占用或数据库连不上                  |
| 端口被占用            | `ss -ltnp \| grep 3001` 找到占用进程结束之；本包不含端口释放器            |
| 数据库连不上          | 确认 MySQL 运行、`env/` 内 `DB_*` 与库名正确；`node db.mjs status` 看结论 |
| 后台打不开 `/geocms/` | nginx 未透传前缀或 admin 未启动（`node start.mjs status`）                |
| 改了 env 不生效       | `node start.mjs restart`（daemon 快照环境变量，重启才重读）               |
