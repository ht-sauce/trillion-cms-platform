# 多站点 CMS 平台

面向集团的多站点 CMS 内容平台。一个平台管理 N 个企业站点（站点 = 企业），**以 GEO（生成式引擎优化）驱动的获客与推流营销为核心目标**，传统 SEO 与 GEO 并重。

- **管理后台**（`apps/admin`）：Nuxt 4 + Element Plus（深空控制台暗色主题），管理站点、内容、会员与 GEO 监控
- **GEO 项目**（`apps/geo`）：站点渲染引擎，支持站点级 **SSG / SSR 双模式开关**
- **服务端**（`apps/server`）：NestJS + Prisma + MySQL 数据层，含静态文件服务与发布管线
- **共享包**（`packages/shared`）：前后端共用的内容模型与契约类型

> 文档分四层，按顺序向下阅读：
>
> | 层级 | 位置                        | 回答什么                                                           |
> | ---- | --------------------------- | ------------------------------------------------------------------ |
> | 入口 | `AGENTS.md`                 | AI / 开发者的开发流程与禁止事项                                    |
> | 需求 | `docs/REQUIREMENTS.md`      | **唯一事实来源**：做什么、什么不能做                               |
> | 架构 | `docs/spec/INDEX.md`        | 怎么设计：系统上下文、服务端/前端、数据模型、接口、发布、部署、ADR |
> | 结构 | `docs/PROJECT_STRUCTURE.md` | 每个目录与文件是干什么的                                           |

---

## 1. 数据库（本地开发）

| 项              | 值                                                                 |
| --------------- | ------------------------------------------------------------------ |
| Host / Port     | 127.0.0.1 / 3306                                                   |
| User / Password | root / 111                                                         |
| 数据库名        | `trillionCms`                                                      |
| 字符集          | utf8mb4 / utf8mb4_unicode_ci                                       |
| 时区            | Asia/Shanghai（UTC+8）                                             |
| 时间格式        | `2026-10-05 10:10:10`（秒精度，Prisma 字段统一 `@db.DateTime(0)`） |

**时间口径**：MySQL 会话为 `+08:00`；Prisma 对 `DATETIME` 按 UTC 读写（标准行为），**接口输出统一按中国时区格式化**（`apps/server/src/common/utils/datetime.ts` + `main.ts` 覆盖 `Date.prototype.toJSON`）。禁止在业务代码里直接用 `toISOString()` 输出时间，会早 8 小时。

Prisma 迁移会自动创建数据库（账号需具备建库权限）；如需手动建库：

```sql
CREATE DATABASE IF NOT EXISTS trillionCms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 2. 方式一：直接安装启动

前置：Node >= 20、pnpm >= 9、本地 MySQL 已启动。

> 说明：pnpm 12 默认阻止依赖的构建脚本（Prisma 引擎、esbuild 等需要执行），仓库根目录已提供 `.npmrc`（`strictDepBuilds=false`）放行；若使用其他 pnpm 版本，可通过 `pnpm approve-builds` 放行相同依赖。
>
> 若所在环境禁止创建符号链接，导致 `pnpm install` 后 `node_modules` 为空，改用：`pnpm install --node-linker=hoisted`。

```bash
# 1) 安装依赖
pnpm install

# 2) 环境变量：无需逐个工程配置
#    开发/测试环境文件已入库（env/.env.development、env/.env.test），按需改数据库口令即可
#    生产/自定义环境从模板创建：copy env/.env.example env/.env.production

# 3) 生成 Prisma Client 并建库建表（数据库连接来自 env/.env.development）
pnpm db:generate
pnpm db:migrate            # 或用 pnpm db:push 直接同步结构

# 4) 初始化数据（管理员 admin / admin123456 + 示例站点与模板）
pnpm db:seed

# 5) 一条命令启动全部工程（先结束占用端口的旧工程，再并发启动；Ctrl+C 一并结束）
pnpm allDev
#    注意：allDev 只启动进程，不建库、不迁移、不写种子数据（数据库初始化永远是第 3、4 步那几条独立命令）
#    服务端启动时会连库，库未就绪则服务端启动失败，管理后台与 GEO 项目不受影响
#    服务端    http://localhost:3001  (Swagger: /api/docs)
#    管理后台  http://localhost:3000
#    GEO 项目  http://localhost:3002
#    局域网访问：就绪后日志会额外打印本机 IP 入口（同网段手机/电脑直接用该地址打开，见 docs/spec/08-adr.md ADR-021）
#    单独启动：pnpm dev:server / pnpm dev:admin / pnpm dev:geo
#    切换环境：pnpm allDev:test（端口 3101/3100/3102，库 trillionCms_test）

# 6) SSG 构建站点静态产物
pnpm build:sites --site star-tech                        # 构建指定站点
# 产物：apps/geo/sites/star-tech/（index.html、news/...、robots.txt、sitemap.xml、llms.txt）
```

### 测试 / 生产：一键上线（数据库与代码是两条命令）

`pnpm allDev` 是**开发形态**（源码直跑、改代码即时生效）。真正上线时，**数据库变更与代码发布分开**，各自一条命令、各自可重复执行：

```bash
# ① 数据库上线（有结构变更才需要；这是唯一的改结构入口）
pnpm db:status:prod    # 只读：看已应用 / 未应用迁移与目标库
pnpm db:deploy:prod    # 增量应用未执行的迁移（幂等；空库自动建库）  —— 测试环境用 db:deploy:test
pnpm db:deploy --env production        # --env 亦可透传

# ② 代码上线（绝不改数据库）
pnpm release --env test --check        # 先体检：配置 + 数据库迁移状态（只读，不构建不启动）
pnpm release:test                      # 测试环境（3101 / 3100 / 3102 + trillionCms_test）
pnpm release:prod                      # 生产环境（env/.env.production，上线前逐项确认）
```

- **数据库上线**顺序：体检（生产库口令为空即阻断，防改错库）→ 只读检查 → `prisma migrate deploy`（只应用未执行的迁移）→ 复核；永不 `db push` / reset
- **代码上线**顺序：体检 → 构建（shared → 服务端 → 管理后台 → GEO 项目）→ 释放端口 → 生产模式启动（各应用 `start:prod`）→ 就绪探测 + `/api/health`
- 代码上线器的体检会做**只读**迁移检查：结构落后于代码就**拦下**并提示先跑 `pnpm db:deploy --env <环境>`（确需先上代码：`--force`）
- 入口地址与健康结论落盘仓库根 `release-endpoints.txt`（不入库）

详见 [`docs/spec/07-deployment.md`](docs/spec/07-deployment.md) §3.5 与 [ADR-034](docs/spec/08-adr.md)。

> **公网 Linux 服务器上线**（PM2 进程守护 + nginx 反代 + 验收 / 回滚 / 备份）：完整操作手册见 [`docs/spec/10-launch-runbook.md`](docs/spec/10-launch-runbook.md)——服务器上进程启停交给 PM2（`pnpm release:prod --build-only` 体检 + 构建 → `pnpm pm2:config` 生成配置 → `pm2 startOrReload`），代码 / 数据库两条命令分离原则不变。

> **免源码上线（部署包，ADR-042）**：服务器上装不了 git / pnpm，或不想在服务器上构建时，在**本地**构建后打包一个自包含文件夹，整体拷过去即可：
>
> ```bash
> # 本地：构建 + 打包（产出仓库根 deploy/，约 792 MB；含密钥、已 gitignore，禁止入库）
> pnpm release:prod --build-only && pnpm pack:deploy
> # 服务器：只要有 Node 20+ / MySQL / nginx
> node db.mjs deploy      # ① 数据库上线（先库）
> node start.mjs daemon   # ② 后台守护运行三端（一条命令管全部应用）
> node start.mjs status   # 守护进程 + 各应用端口健康
> ```
>
> `deploy/` 内含三端产物与依赖（零 symlink，跨机拷贝不断链）、派生配置、`start.mjs` / `db.mjs` / `nginx.conf.example`，详见包内 `README.md` 与 [10 号手册 §4.0](docs/spec/10-launch-runbook.md)。

默认管理员账号：`admin` / `admin123456`（首次登录后请修改）。

### 配置来源（重要）

- **端口**：唯一事实来源是根 [`config/ports.mjs`](config/ports.mjs)（server 3001 / admin 3000 / geo 3002），应用代码内不再出现端口字面量
- **环境变量**：统一放在根 [`env/`](env) 目录，由 [`config/`](config) 派生后经启动器注入；三个应用都不再自带 `.env`
- **环境切换**：`--env development|test|production`（默认 development），详见 [`docs/spec/07-deployment.md`](docs/spec/07-deployment.md) §3

---

## 3. 方式二：Docker 部署

```bash
cd docker
docker compose up -d --build

# 首次启动后初始化表结构与种子数据
docker compose exec server pnpm db:migrate
docker compose exec server pnpm db:seed
```

| 服务                     | 地址                  | 说明                                         |
| ------------------------ | --------------------- | -------------------------------------------- |
| nginx                    | http://localhost:8080 | 托管 GEO 项目 SSG 静态产物（按站点目录分发） |
| 管理后台                 | http://localhost:3000 | Nuxt SSR                                     |
| GEO 项目（SSR 模式站点） | http://localhost:3002 | SSR 站点运行时                               |
| 服务端                   | http://localhost:3001 | API + Swagger（生产环境关闭 Swagger）        |

MySQL 容器已设置 `default-time-zone=+08:00`，保证时间写入为中国时区。

---

## 4. 常用命令

| 命令                                                        | 说明                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm allDev`                                               | **一键启动全部工程（开发形态）**（先结束占用端口的旧进程再启动，Ctrl+C 一并结束）                                                         |
| `pnpm allDev:test` / `allDev:prod`                          | 开发形态，用测试 / 生产环境文件启动（`--env test` / `--env production`）                                                                  |
| `pnpm dev:admin` / `dev:geo` / `dev:server`                 | 单独启动某个应用（同样先释放该应用端口）                                                                                                  |
| `pnpm release:test` / `release:prod`                        | **代码上线**：体检 → 构建 → 生产模式启动（不碰数据库）                                                                                    |
| `pnpm release --env <环境> [--check] [--skip-build] [应用]` | 代码上线器完整用法（`--check` 只体检；`--skip-build` 沿用上次产物只重启）                                                                 |
| `pnpm release --env <环境> --build-only`                    | 体检 + 构建后停止，不启动进程（Linux 服务器配合 PM2 使用，与 `--check` / `--skip-build` 互斥）                                            |
| `pnpm pm2:config`                                           | 生成 PM2 进程配置 `ecosystem.config.json`（Linux 直装上线，见 docs/spec/10-launch-runbook.md）                                            |
| `pnpm pack:deploy[:env]`                                    | **打包部署包** `deploy/`：本地构建后产出可整体拷贝的自包含文件夹，服务器 `node start.mjs` 一条命令运行（免 git / pnpm / PM2，见 ADR-042） |
| `pnpm db:status[:test\|:prod]`                              | **数据库只读检查**：看目标库与「已应用 / 未应用」迁移清单                                                                                 |
| `pnpm db:deploy[:test\|:prod]`                              | **数据库上线**：增量应用未执行的迁移（唯一改结构入口；空库自动建库）                                                                      |
| `pnpm build:shared`                                         | 构建共享类型包（服务端类型依赖它，`build:server` 已内置）                                                                                 |
| `pnpm build:admin` / `build:geo` / `build:server`           | 生产构建（经根执行器注入全局配置）                                                                                                        |
| `pnpm build:sites --site <slug>`                            | 增量 SSG 构建指定站点静态产物                                                                                                             |
| `pnpm db:status` / `db:deploy`                              | 数据库上线（默认 development 环境；测试/生产用 `:test` / `:prod` 后缀）                                                                   |
| `pnpm db:migrate` / `db:generate` / `db:seed` / `db:studio` | 开发向数据库操作（`db:migrate` = `prisma migrate dev`，仅本地；生产用 `db:deploy`）                                                       |
| `pnpm lint`                                                 | 全项目 ESLint                                                                                                                             |
| `pnpm format`                                               | 全项目 Prettier 格式化（`docs/` 与 `env/` 已在 `.prettierignore` 中排除）                                                                 |

---

## 5. 关键约定速查

- **术语**：生成的站点 = GEO 项目；admin = 管理后台；server = 服务端
- **配置**：端口唯一来源 `config/ports.mjs`；环境变量统一在根 `env/`（`env/.env.<环境>`），应用内禁止写端口/数据库字面量
- **启动与上线**：开发走 `pnpm allDev`（源码直跑）；**代码上线**走 `pnpm release:test|prod`（构建 + 生产模式启动，不碰数据库）；**数据库上线**走 `pnpm db:status*`（看）→ `pnpm db:deploy*`（增量应用，唯一改结构入口）——两者是两条独立命令，有结构变更时先数据库、后代码
- **文档**：`docs/` 不参与 Prettier 格式化；`docs/PROJECT_STRUCTURE.md` 中每个文件均为可点击链接，直达工程文件
- **多站点隔离**：所有内容表挂 `siteId`，Prisma 查询强制过滤；平台管理员全量，站点管理员仅授权站点（菜单 + 后端 Guard 双保险）
- **渲染模式**：`sites.renderMode` 网站级 `ssg` / `ssr` 开关，同一套模板管线两种形态
- **内容模型**：Site → Channel（目录/功能块）→ Page → 结构化 Block；状态流 `draft → pending_review → published`
- **发布**：手动发布触发构建任务（串行执行），页面级增量 SSG，产物原子替换至 `sites/<slug>/`
- **GEO**：发布自动生成 `llms.txt` / `sitemap.xml` / `robots.txt` / 每页 JSON-LD；robots 默认放行全部已知 AI 爬虫
- **UI 规范**：管理后台 12px 基准字号、8px 间距栅格、信息密度优先
- **管理后台导入**：`app/config/` 下的模块一律用 `~` 别名（`~/config/api`）；相对路径 `../../config/api` 会被 Nuxt import-protection 误判而构建失败
- **共享契约**：`packages/shared` 只放类型，是编译型包，构建服务端前需先 `pnpm build:shared`
- **工程规范**：TypeScript 全栈、ESLint + Prettier、无 git hooks 限制
