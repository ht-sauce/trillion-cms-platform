# PROJECT_STRUCTURE.md · 全局结构与文件说明

> 本文件按目录分级说明**每个目录的职责与每个文件的用途**，是项目文档的唯一结构化出处。
> 维护规则（写入 AGENTS.md）：每次新增 / 删除 / 修改文件用途后，必须同步更新本文件对应条目。
>
> **链接约定**：每个文件都以相对路径链接到真实文件，**点击即可在编辑器中直接打开**（链接基点为本文件所在目录 `docs/`）。
> 目录本身不带链接（避免跳转歧义），以粗体或代码形式标注。

---

## /（仓库根目录）

Monorepo 工作区根，只放工程配置、全局配置与全局文档，不放业务代码。

- [`package.json`](../package.json) —— workspace 根：跨应用脚本（`allDev` 开发启动 / `release:*` 代码上线 / `db:deploy*` 数据库上线 / `build:*` / 开发向 `db:*`），所有脚本经根 `scripts/` 的启动器、上线器与执行器执行
- [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) —— 声明工作区范围 `apps/*`、`packages/*` 与依赖构建白名单
- [`pnpm-lock.yaml`](../pnpm-lock.yaml) —— 依赖锁定文件（自动生成）
- [`.npmrc`](../.npmrc) —— pnpm 行为配置（`strictDepBuilds=false`，放行 Prisma 引擎等依赖构建脚本）
- [`.prettierrc`](../.prettierrc) —— Prettier 格式化规则（semi=false、singleQuote、printWidth=120 等）
- [`.prettierignore`](../.prettierignore) —— 格式化忽略清单（产物、依赖、锁文件，以及 `docs/` 与 `env/`）
- [`.editorconfig`](../.editorconfig) —— 编辑器基础格式（UTF-8、LF、2 空格）
- [`.gitignore`](../.gitignore) —— Git 忽略（依赖、产物、`sites/` 产物、`uploads/`、`env/.env.production`、PM2 配置 `ecosystem.config.json`、部署包 `deploy/`、启动器 / 上线器写入的入口清单 `dev-endpoints.txt` / `release-endpoints.txt`）
- `deploy/`（**运行时生成，不入库**）—— `pnpm pack:deploy` 产出的自包含部署包（ADR-042，约 792 MB）：`start.mjs` / `db.mjs` / `nginx.conf.example` / `README.md` + `config/` + `env/.env.<环境>` + `apps/{server,admin,geo}` 产物与依赖，整体拷贝到服务器后 `node start.mjs daemon` 即可运行；模板来源 [`scripts/deploy-runtime/`](../scripts/deploy-runtime)
- [`nginx.conf.example`](../nginx.conf.example) —— **生产 nginx 落地配置（直装 · git 仓库形态）**：公网 IP `11.11.11.11` + nginx 直听 `8080` 的单域名同源分流（`/geocms/`→3000、`/geoserver/`→3001、`/static/` 直出、`/`→站点 SSG 产物）；拷贝到 `/etc/nginx/sites-available/` 即用。通用参考（域名 + 80/443）见 [`docs/spec/10-launch-runbook.md`](./spec/10-launch-runbook.md) §7，部署包形态的模板另见 [`scripts/deploy-runtime/`](../scripts/deploy-runtime)
- [`README.md`](../README.md) —— 项目基础说明：数据库、两种启动方式、常用命令、关键约定
- [`AGENTS.md`](../AGENTS.md) —— AI 开发规范入口：术语、目录约定、先读后开发流程、禁止事项

## /config（全局配置层，与 apps/ 同级）

**全平台配置的唯一事实来源中的"结构化配置与派生逻辑"部分**：端口表、应用清单、环境文件解析、API 基址 / CORS / 数据库连接串派生。应用代码不再硬编码端口与数据库，统一由本目录派生后注入进程。

- [`index.mjs`](../config/index.mjs) —— 全局配置出口：`loadConfig()` 加载环境并派生端口/API/数据库/CORS/局域网地址，`buildAppEnv()` 组装某应用进程的环境变量，`describeConfig()` 生成启动摘要（含局域网 IP 行），`describeEndpoints()` 生成各工程访问入口清单（服务端含健康检查入口、生产环境自动略去 Swagger，`options.lan=false` 时不出局域网段落），`detectLanHosts()` 探测本机 IPv4（与 Vite 一致：全量返回，不排序、不区分虚拟网卡）
- [`ports.mjs`](../config/ports.mjs) —— 端口表：默认端口（server 3001 / admin 3000 / geo 3002）、环境变量键名映射与端口合法性校验
- [`apps.mjs`](../config/apps.mjs) —— 应用清单：短名、包名、工程目录、标题、日志配色、开发/构建/生产启动脚本名（`devScript` / `buildScript` / `startScript`）与共享类型包名 `SHARED_PACKAGE`（启动器、执行器、上线器共用）
- [`env.mjs`](../config/env.mjs) —— 环境解析：`--env` 解析、`env/.env.<环境>` 读取、极简 .env 解析器、必填变量校验

## /env（全局环境变量，与 apps/ 同级）

**各环境的变量值**：数据库、密钥、站点识别等；与 `config/` 分工明确（值 vs 结构/派生）。三个应用不再自带 `.env`。

- [`.env.development`](../env/.env.development) —— 开发环境（本机 MySQL、默认端口），已入库，`pnpm allDev` 开箱可用
- [`.env.test`](../env/.env.test) —— 测试环境（端口 3100/3101/3102、独立测试库），与开发环境可同机并存
- [`.env.production`](../env/.env.production) —— 生产环境（**不入库**，见 `.gitignore`；上线前必须逐项确认密钥与地址）
- [`.env.example`](../env/.env.example) —— 环境变量模板与逐项说明（新环境 / 新机器从此复制）

## /scripts（根级工程脚本）

本地启动与包脚本执行工具，依赖根 `config/`，零第三方依赖。

- [`dev.mjs`](../scripts/dev.mjs) —— **开发启动器**（`pnpm allDev` / `pnpm dev:*`）：加载全局配置 → 结束占用端口的旧进程（逻辑在 `port-guard.mjs`）→ 并发启动工程（各应用 `devScript`，源码直跑）→ 日志加前缀 → **摘要后先打印并落盘一份入口清单**（按配置端口，避免等 Nuxt 首次编译期间终端没有任何地址信息）→ **各工程就绪（日志就绪标志 / 端口监听）且静默 5s 后再打印一份**（含后台登录页、Swagger 文档与局域网入口，按实际监听端口，端口回退时自动修正）；清单被后续日志顶出屏幕时**自动补打**（日志静默 3s 即补打 — 每来一行新日志重置计时；日志持续不停则每 15s 兜底一次；上限 30 次），落盘文件为仓库根 `dev-endpoints.txt`（不入库）→ Ctrl+C 回收全部子进程
- [`exec.mjs`](../scripts/exec.mjs) —— **包脚本执行器**：以注入全局环境变量的方式执行某工程的 package.json 脚本（`db:*`、`build:*` 等脱离启动器的命令）
- [`release.mjs`](../scripts/release.mjs) —— **代码上线器**（`pnpm release:test` / `release:prod` / `release --env <环境> [应用...]`）：把平台**代码**发布到测试/生产环境，顺序固定为 **体检（密钥占位值 / 回环地址 / 产物齐备 / 数据库迁移只读检查）→ 构建（shared → 服务端 → 管理后台 → GEO 项目）→ 释放端口 → 生产模式启动（各应用 `start:prod`）→ HTTP 就绪探测（server `/geoserver/health`、admin `/geocms/`、geo `/`）+ `/geoserver/health` 运行时体检 → 打印入口并落盘 `release-endpoints.txt`**；**绝不执行迁移**，结构落后只拦下并提示先跑 `pnpm db:deploy`（目标只有 admin/geo 时跳过该检查）；支持 `--check`（只体检）/ `--build-only`（体检 + 构建后停止，不启动进程，Linux 服务器配合 PM2 使用）/ `--skip-build` / `--force`，任一步失败立即中止
- [`db-release.mjs`](../scripts/db-release.mjs) —— **数据库上线器**（`pnpm db:deploy[:test|:prod]` / `pnpm db:status[:env]`）：**唯一的改结构入口**，顺序固定为 **体检（环境文件 / 目标库 / 生产库口令为空或占位值即阻断，防改错库）→ 只读检查（`prisma migrate status`：已最新 / 待应用 / 库不存在 / 不可达）→ `prisma migrate deploy`（只应用未执行的迁移，幂等、非交互、空库自动建库）→ 复核**；`--check` 等价 `db:status`（只读），`--force` 忽略阻断项；只做增量应用，永不 `db push` / reset
- [`pm2-config.mjs`](../scripts/pm2-config.mjs) —— **PM2 配置生成器**（ADR-041，`pnpm pm2:config` / `node scripts/pm2-config.mjs --env <环境>`，缺省 production）：以全局配置派生三端进程定义（进程名 `trillion-*`、`cwd` 对齐各应用包目录、`script` 与 `start:prod` 同口径、`env` 为 `buildAppEnv()` 结果、防崩溃风暴守护参数），写仓库根 `ecosystem.config.json`（PM2 原生 JSON，**含密钥：已 gitignore，禁止提交或跨机拷贝**）；产物缺失只警告不阻断；与上线器 `--build-only` 配套（启动 / 重载 / 开机自启操作见 spec/10-launch-runbook.md）
- [`port-guard.mjs`](../scripts/port-guard.mjs) —— **端口守护**（启动器与上线器共用）：查询监听端口的进程（Windows `netstat` / POSIX `lsof`）、结束进程（`taskkill /T /F` / `kill`）、释放端口并等待可用（旧进程残留是「端口被占用」的常见根因）
- [`pack-deploy.mjs`](../scripts/pack-deploy.mjs) —— **部署包打包器**（ADR-042，`pnpm pack:deploy` / `node scripts/pack-deploy.mjs --env <环境>`，缺省 production）：本地把三端产物 + 依赖 + 派生配置汇集为仓库根 `deploy/`（**免源码上线形态**，服务器只要有 Node 20+ / MySQL / nginx，无需 git / pnpm / PM2）。流程：**体检（三端产物 + shared dist 齐备）→ 拷 `config/` 与 `env/.env.<环境>`（含密钥）+ 运行时模板 → `pnpm deploy --node-linker=hoisted` 收集 server / geo（零 symlink，跨机拷贝不断链）并按白名单清理开发期文件 → 服务端包内补跑 `prisma generate`（机器产物随包提供）→ admin 拷 `.output` → 校验关键文件清单 → 输出大小 / 站点 / 拷贝提示**；产物 `deploy/` 与 `scripts/deploy-runtime/` 说明见下方条目，**含数据库口令与 JWT 密钥已 gitignore，禁止入库或跨机拷贝**
- [`deploy-runtime/`](../scripts/deploy-runtime) —— **部署包运行时模板**（随 `pnpm pack:deploy` 拷入 `deploy/` 根，ADR-042）：`start.mjs`（进程入口：按 `config/apps.mjs` 清单 spawn 各应用、`daemon` 后台守护 + 崩溃自动重启（4s / 上限 10 次）/ `stop` / `status` / `restart`，日志落 `logs/`、pid 落 `.run/`）、`db.mjs`（数据库入口：`status` / `deploy` / `seed`，直接调包内 server 自带 prisma CLI 与 tsx，服务器无需 pnpm）、`README.md`（服务器侧操作说明）、`nginx.conf.example`（单域名同源反代 + 静态托管模板）；操作口径见 spec/10-launch-runbook.md §4.0
- [`pnpm.mjs`](../scripts/pnpm.mjs) —— pnpm 调用封装：跨平台定位 pnpm 可执行入口，避免 Windows 下 `.cmd` 必须走 shell 的参数拼接告警
- [`bootstrap-site.mjs`](../scripts/bootstrap-site.mjs) —— **建站描述导入 CLI**（09 §12.2，`pnpm site:bootstrap`）：登录后台 → `POST /sites/bootstrap` 灌入整站描述 JSON（站点档案 + 目录树 + 页面与块 + 导航）；幂等，可重复执行
- [`merge-site-data.mjs`](../scripts/merge-site-data.mjs) —— **建站描述分片合并器**（`pnpm site:merge`）：站点档案 `site-profile.json` + 页面分片 `pages-*.json` → 单份描述（缺省输出 `scripts/data/site.json`，可用 `--out` 指定）；顺带校验目录引用与导航引用可解析
- [`check-site-data.mjs`](../scripts/check-site-data.mjs) —— **建站描述契约校验器**（`pnpm site:check <描述文件>`，**路径必填**）：以块 SFC 的 `defineBlock` 声明为唯一事实来源，递归比对每个块实例的键名与必填项（`--dump-fields` 只打印字段清单）
- [`upload-site-assets.mjs`](../scripts/upload-site-assets.mjs) —— **素材库双轨上传**（ADR-037 轨①）：把 `apps/geo/public/assets/img/**` 图片以 `siteId` 上传进 CMS 素材库（按 `originalName` 幂等判重，结尾做磁盘↔素材库集合对账）；站点页面引用的 `/assets/img/**` 是轨②静态直出，两轨文件名一一对应
- [`check-built-site.mjs`](../scripts/check-built-site.mjs) —— **站点产物机械检查**（09 §12.3 step7 补充 / §12.4）：对构建产物逐页校验唯一 h1 / title / description / canonical、JSON-LD 可解析、内链完整、图片可达、NAP 电话口径、标签闭合；只做机械校验，**不能替代 §12.5 人眼视觉比对**

## /docs

项目文档目录。

- [`REQUIREMENTS.md`](./REQUIREMENTS.md) —— **需求规格（唯一事实来源）**：定位、架构决策、数据模型、GEO 清单、权限、监控、UI、部署、分期、否决专区
- [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) —— 本文件：全局目录与文件说明
- [`GLOSSARY.md`](./GLOSSARY.md) —— **术语表（专有名词统一解释口径）**：按「地址与域名 / 内容 / 块 / 发布与产物 / GEO / 工程」分组解释 slug、canonical、产物清单、内容指纹、公共模板等名词，并标注相关文档；后台界面上的问号提示文案来源是 `apps/admin/app/config/glossary.ts`
- **`spec/`（架构与技术规格层，编号体系）** —— 介于需求与文件说明之间，定义"系统怎么设计"。改动组件/数据表/接口/发布/部署前必须先改这里：

  | 文件                                                | 内容                                                    |
  | --------------------------------------------------- | ------------------------------------------------------- |
  | [`spec/INDEX.md`](./spec/INDEX.md)                  | 索引与阅读顺序、文档优先级、维护契约（改动必读）        |
  | [`spec/00-overview.md`](./spec/00-overview.md)      | 系统总纲：定位、术语、架构原则、质量属性、边界与约束    |
  | [`spec/01-system-context.md`](./spec/01-system-context.md) | C4 L1/L2：系统上下文、容器划分、通信矩阵、关键场景时序  |
  | [`spec/02-server-architecture.md`](./spec/02-server-architecture.md) | 服务端分层、模块职责、横切机制、站点隔离、已知约束 |
  | [`spec/03-frontend-architecture.md`](./spec/03-frontend-architecture.md) | 管理后台与 GEO 项目结构、请求链路、双模式取数、约束 |
  | [`spec/04-data-model.md`](./spec/04-data-model.md)  | 15 张表职责与关系、字段口径、隔离与索引、迁移与种子     |
  | [`spec/05-api-contract.md`](./spec/05-api-contract.md) | 57 条接口清单、鉴权矩阵、状态码、发布体检规则        |
  | [`spec/06-publish-and-geo.md`](./spec/06-publish-and-geo.md) | 发布流水线、原子替换、产物规范、GEO 四层落地    |
  | [`spec/07-deployment.md`](./spec/07-deployment.md)  | Docker/直装拓扑、端口、环境变量、持久化、健康检查、运维 |
  | [`spec/08-adr.md`](./spec/08-adr.md)                | 架构决策记录（含否决项与副作用）                        |
  | [`spec/09-site-editor.md`](./spec/09-site-editor.md) | 站点内容编辑器与块代码化完整规格（含完整建站）          |
  | [`spec/10-launch-runbook.md`](./spec/10-launch-runbook.md) | Linux 直装上线操作手册：服务器初始化、PM2 守护、首次部署、日常更新、nginx、验收与回滚 |

## /docker

部署目录：Docker 编排与镜像定义。

- [`docker-compose.yml`](../docker/docker-compose.yml) —— 一键编排 MySQL / 服务端 / 管理后台 / GEO 项目 / Nginx（容器内环境变量仍由 compose 显式注入，对应关系见 `spec/07-deployment.md`）
- [`Dockerfile.server`](../docker/Dockerfile.server) —— 服务端镜像（Prisma 生成 + nest build）
- [`Dockerfile.frontend`](../docker/Dockerfile.frontend) —— 前端镜像（`APP=admin` 走 SPA、`APP=geo` 走 SSR，均由 Nitro 服务托管 `.output/`）
- [`nginx/nginx.conf`](../docker/nginx/nginx.conf) —— 托管 GEO 项目 SSG 静态产物（按站点目录分发）+ `/static` 上传资源

## /packages/shared（共享类型包）

前后端共用的类型契约，避免契约重复定义。

- [`package.json`](../packages/shared/package.json) —— 共享包配置（`@trillion/shared`；编译型包，产物为 `dist`）
- [`tsconfig.json`](../packages/shared/tsconfig.json) —— shared 独立编译配置（`src` → `dist`，输出 `.js` + `.d.ts`）
- [`eslint.config.mjs`](../packages/shared/eslint.config.mjs) —— shared 的 ESLint 配置
- [`src/index.ts`](../packages/shared/src/index.ts) —— 类型统一出口
- [`src/types/site.ts`](../packages/shared/src/types/site.ts) —— 站点实体（主域名 `domain` + 别名域名 `domains`）、渲染模式、主题令牌、静态文件类型
- [`src/types/content.ts`](../packages/shared/src/types/content.ts) —— 栏目 / 页面 / 模板定义与结构化 Block 数据类型
- [`src/types/api.ts`](../packages/shared/src/types/api.ts) —— 统一响应、分页、管理员、会员、埋点载荷类型
- [`src/types/menu.ts`](../packages/shared/src/types/menu.ts) —— 后台菜单实体与菜单树节点类型（含状态枚举）
- [`src/types/role.ts`](../packages/shared/src/types/role.ts) —— 后台角色实体与状态枚举（`platform` / `builtin` 标记）
- [`src/types/block.ts`](../packages/shared/src/types/block.ts) —— Block 类型清单与中文元数据（管理后台表单使用）
- **`src/utils/`（跨端运行时工具，非纯类型）**：`placeholders.ts` / `block-code.ts` / **[`geo-url.ts`](../packages/shared/src/utils/geo-url.ts) —— 站点地址与站点前缀的唯一实现**（`LOOPBACK_HOSTS` / `hostnameOf` / `isLoopbackUrl` / `normalizeBaseUrl` / `siteUrlPrefix` / `buildSiteUrl`：回环基址带 `/{slug}`、域名基址不带），服务端预览票据、管理后台列表「预览」、GEO 回环判定共用一份（见 ADR-031）
- **`dist/`（构建产物）** —— 服务端 `tsconfig.paths` 指向此处，**构建服务端前必须先 `pnpm build:shared`**

---

## /apps/server（服务端）

NestJS + Prisma + MySQL 数据层，负责内容数据、上传存储、鉴权、发布管线、埋点与监控采集。

### 工程文件

- [`package.json`](../apps/server/package.json) —— 依赖与脚本（dev/build/start:prod、prisma 系列：`prisma:migrate` 仅开发、`prisma:deploy` 增量发布、`prisma:status` 只读查看；`prisma.schema` 指向 `prisma/schema`）
- [`tsconfig.json`](../apps/server/tsconfig.json) —— TS 编译配置（装饰器元数据、路径映射）
- [`nest-cli.json`](../apps/server/nest-cli.json) —— Nest CLI 配置
- [`eslint.config.mjs`](../apps/server/eslint.config.mjs) —— 服务端 ESLint 配置
- [`resync-site-blocks.mjs`](../apps/server/resync-site-blocks.mjs) —— **站点块副本重同步 CLI**：把公共模板（`siteId=0`）当前代码推送到指定站点的私有块副本（按 sha256 比对，更新则版本 +1 并保留版本记录）。改块流程必跑（09 §7.2），否则站点线上仍渲染旧版块代码
- [`check-blocks.mjs`](../apps/server/check-blocks.mjs) / [`check-site-blocks.mjs`](../apps/server/check-site-blocks.mjs) —— 调试工具：查询公共（`siteId=0`）与站点私有块定义的版本 / hash / ADR-036 标记，对账用
- [`check-unused-static-files.mjs`](../apps/server/check-unused-static-files.mjs) —— **孤立素材扫描 / 清理 CLI**：判定 `static_files` 中未被数据库（站点文件 ID、页面块数据、块代码等）与 GEO 构建产物引用的孤立素材，默认只读输出清单，加 `--delete` 删除库记录与物理文件

### scripts/（一次性迁移脚本）

- [`sync-site-images.mjs`](../apps/server/scripts/sync-site-images.mjs) —— **站点图片迁移 CLI**（一次性）：把站点 Page.blocks 里的 `/assets/img/**` 引用迁移到素材库（复制进 `uploads/<yyyy>/<mm>/` 并建 `StaticFile` 记录，URL 改写为 `/static/**`）；源缺失的 `env-NN.*` 用真实环境图占位入库；幂等可重跑（同站点同 originalName 且 hash 相同不重复建记录），`--dry-run` 演练、`--site <id>` 指定站点（默认 3）；不触发发布/构建
- [`backfill-news-faq-tables.mjs`](../apps/server/scripts/backfill-news-faq-tables.mjs) —— **新闻/问答表回填 CLI**（一次性）：把 siteId=3 的 `/news/*`、`/faq/q*` 详情页回填进管理源表 `NewsArticle` / `FaqItem`（标题/摘要/正文/发布日期/分类/slug/pageId），幂等（按 siteId+slug 判重跳过，预期 7 + 102 条）；仅依赖 `@prisma/client`，连接串取 `DATABASE_URL`

> 环境变量不再由工程内 `.env` 提供：统一放仓库根 `env/`，由 `config/` 派生后经启动器注入（见 [`spec/07-deployment.md`](./spec/07-deployment.md) §3）。

### prisma/（数据库，模块化 schema）

- [`schema/main.prisma`](../apps/server/prisma/schema/main.prisma) —— generator 与 datasource 配置（多文件 schema 入口）
- [`schema/defaults.prisma`](../apps/server/prisma/schema/defaults.prisma) —— 默认值说明文档（robotsPolicy / themeConfig / blocks JSON 结构）
- [`schema/site.prisma`](../apps/server/prisma/schema/site.prisma) —— `Site` 站点表（企业元数据 + 网站信息 + SEO/GEO 默认值 + 渲染模式）与 `SiteDomain` 站点别名域名表（主域名仍是 `Site.domain`，本表存别名，多域名映射见 ADR-022）
- [`schema/static-file.prisma`](../apps/server/prisma/schema/static-file.prisma) —— `StaticFile` 静态文件 URL 表（URL 与物理存储解耦）
- [`schema/admin-user.prisma`](../apps/server/prisma/schema/admin-user.prisma) —— `AdminUser` 管理后台用户（角色 + 授权站点）
- [`schema/member.prisma`](../apps/server/prisma/schema/member.prisma) —— `Member` 站点会员（按 siteId 隔离）
- [`schema/content.prisma`](../apps/server/prisma/schema/content.prisma) —— `Channel` 栏目、`Page` 页面（模板 + Block）、`Template` 模板定义
- [`schema/entity.prisma`](../apps/server/prisma/schema/entity.prisma) —— `Entity` 品牌/产品实体（GEO 实体一致性）
- [`schema/track.prisma`](../apps/server/prisma/schema/track.prisma) —— `TrackEvent` 埋点事件、`AiCrawlEvent` AI 抓取事件
- [`schema/news-faq.prisma`](../apps/server/prisma/schema/news-faq.prisma) —— `NewsArticle` 新闻文章表、`FaqItem` 问答条目表（**管理源**，见 04 §8；`pageId` 为发布产物 `Page` 弱引用，`[siteId, slug]` 唯一）
- [`schema/publish-task.prisma`](../apps/server/prisma/schema/publish-task.prisma) —— `PublishTask` 发布构建任务（队列与日志）
- [`schema/menu.prisma`](../apps/server/prisma/schema/menu.prisma) —— `Menu` 后台侧栏菜单（`parentId` 自关联，最多三级）
- [`schema/role.prisma`](../apps/server/prisma/schema/role.prisma) —— `Role` 后台角色（`platform` 平台级标记、`builtin` 内置保护）与 `RoleMenu` 角色-菜单授权关系
- [`schema/migrations/migration_lock.toml`](../apps/server/prisma/schema/migrations/migration_lock.toml) —— 迁移锁（Prisma 生成）
- [`schema/migrations/20261020120000_init_id_string/migration.sql`](../apps/server/prisma/schema/migrations/20261020120000_init_id_string/migration.sql) —— **唯一迁移（2026-10-20 重建基线）**：21 张表的完整 DDL、全部外键与主键（`prisma migrate diff --from-empty` 生成）；主键为 uuid v7 字符串（ADR-043）。此前历史迁移与当前 schema 已严重漂移，整体替换废弃（见 04 §6）
- [`maintenance/fix-prisma-migrations-meta-table.sql`](../apps/server/prisma/maintenance/fix-prisma-migrations-meta-table.sql) —— **一次性环境修复（不是迁移）**：旧版 Prisma CLI 建出的 `_prisma_migrations` 台账 `applied_steps_count` 无 DEFAULT，会让 `migrate deploy` 报「Field 'applied_steps_count' doesn't have a default value」而整体失败；本脚本为其补默认值，幂等，用 `prisma db execute --file` 执行（见 10-launch-runbook §4.2）
- [`maintenance/fix-table-name-case.sql`](../apps/server/prisma/maintenance/fix-table-name-case.sql) —— **一次性环境修复（不是迁移）**：Windows MySQL（`lower_case_table_names=1`）导库会把表名落到小写，Linux 默认区分大小写、Prisma 模型未写 `@@map`，于是报「The table `AdminUser` does not exist」；本脚本按映射把 21 张业务表改回大驼峰（`_prisma_migrations` 保持小写），幂等、仅改表名不动数据行、含外键自动改写与前后核对（见 10-launch-runbook §11）
- [`seed.ts`](../apps/server/prisma/seed.ts) —— 种子数据：内置角色（`admin` / `site_admin`）与角色菜单授权、平台管理员（绑定 `admin` 角色）、后台菜单（站点管理目录：站点列表 / 新闻资讯 / 高频问答；内容管理下六页：页面 / 编辑器 / 块库 / 块模板 / 导航 / 素材 + 系统设置四个子页）、默认模板、示例站点/栏目/页面、内置块定义（若 `prisma/blocks/*.vue` 存在则写入**模板库** `siteId = 0`，目录缺失时跳过）与示例站点的**块副本**（ADR-035）
- **`blocks/*.vue`（41 个，块唯一真源）** —— 公共块模板代码（`defineBlock` 字段声明 + 原型类名 DOM，09 §7.4.1 / ADR-036）。改块必须改这里再 `pnpm db:seed` → 站点副本重同步 → `geo blocks:sync`；直接改数据库或只改 GEO 侧 `Blk*.vue` 会在下次 seed / 构建时被覆盖或产生「块不可用」。`telbar`（尾部预约条）/`vcard-grid`（键值对卡片栅格）在仁爱建站时新增（09 §7.2.2）

### src/（源码）

- [`main.ts`](../apps/server/src/main.ts) —— 启动入口：设置中国时区、**全局前缀 `/geoserver`**（ADR-040）、全局管道/拦截器/异常过滤器、静态资源、CORS（读派生白名单）、Swagger（非生产，`/geoserver/docs`）；拦截 `unhandledRejection` / `uncaughtException`（只记录日志不退出，防发布链路异常带崩服务，ADR-032）
- [`app.module.ts`](../apps/server/src/app.module.ts) —— 根模块：配置模块（zod 校验、环境变量由启动器注入）+ 全部业务模块注册

### src/config/（服务端配置映射，值的来源是根 env/ 与 config/）

- [`configuration.ts`](../apps/server/src/config/configuration.ts) —— 全局配置工厂（环境、端口、时区、数据库、JWT、上传、CORS、AI 清单、构建目录）
- [`env.validation.ts`](../apps/server/src/config/env.validation.ts) —— 环境变量 zod 校验（端口与数据库无应用内默认值，缺失启动即失败）
- [`ai-crawlers.ts`](../apps/server/src/config/ai-crawlers.ts) —— AI 爬虫 UA 清单、UA 匹配、robots.txt 生成（UA 自动去重，并输出「AI 爬虫策略说明」注释段；`hasAiCrawlerPolicy` 供发布前检查判定）
- [`database-url.ts`](../apps/server/src/config/database-url.ts) —— 连接串拼装（密码特殊字符编码）

### src/common/（公共能力）

- [`constants.ts`](../apps/server/src/common/constants.ts) —— **分页通用常量**：默认每页 20、档位 `[10, 20, 30, 50, 100]`，以及入参收敛函数 `normalizePage` / `normalizePageSize`（与前端 `config/pagination.ts` 对齐）
- [`types/api-result.ts`](../apps/server/src/common/types/api-result.ts) —— 统一响应结构类型与 `ok()` 助手
- [`interceptors/transform.interceptor.ts`](../apps/server/src/common/interceptors/transform.interceptor.ts) —— 成功响应统一包装 `{ code:0, message:'ok', data }`
- [`filters/http-exception.filter.ts`](../apps/server/src/common/filters/http-exception.filter.ts) —— 全局异常过滤器（统一结构 + 5xx 日志）
- [`decorators/current-user.decorator.ts`](../apps/server/src/common/decorators/current-user.decorator.ts) —— `@CurrentUser()` 取登录用户
- [`guards/admin-auth.guard.ts`](../apps/server/src/common/guards/admin-auth.guard.ts) —— JWT-A 鉴权守卫（管理后台）
- [`guards/platform-admin.guard.ts`](../apps/server/src/common/guards/platform-admin.guard.ts) —— 平台级操作守卫（仅 super_admin）
- [`common.module.ts`](../apps/server/src/common/common.module.ts) —— **全局公共模块**：注册并导出 JwtModule，让各业务模块直接使用守卫而无需各自注册 JWT
- [`workers/sfc-compile.ts`](../apps/server/src/common/workers/sfc-compile.ts) —— **SFC 编译主线程入口**：把块编译丢进 worker 线程（15s 超时），超时/崩溃归一为 400 错误不回退主线程；worker 产物缺失时降级主线程并告警（ADR-032）
- [`workers/sfc.worker.ts`](../apps/server/src/common/workers/sfc.worker.ts) —— **SFC 编译 Worker**（独立线程）：一次性执行 `validateBlockSfc` 后回传结果，避免 CPU 编译阻塞 NestJS 主事件循环
- [`utils/geo-check.ts`](../apps/server/src/common/utils/geo-check.ts) —— **发布前 GEO 体检纯函数**：页面级 `checkPageGeo`（标题/摘要/编审/案例禁用字段/canonical/NAP）与站点级 `checkSiteGeo`（实体声明 / llms / robots AI 策略 / robots meta / sitemap 核心 URL / NAP）。纯函数、被 content 与 geo 两个模块共用，故放在 `common/utils`
- [`utils/site-scope.ts`](../apps/server/src/common/utils/site-scope.ts) —— **站点数据权限**：断言与查询过滤（真正的安全边界）
- [`utils/json.ts`](../apps/server/src/common/utils/json.ts) —— Prisma JSON 字段读写收窄（`toJsonInput` / `fromJson`）
- [`utils/datetime.ts`](../apps/server/src/common/utils/datetime.ts) —— 中国时区时间格式化（输出 `YYYY-MM-DD HH:mm:ss`）
- [`utils/jwt-expiry.ts`](../apps/server/src/common/utils/jwt-expiry.ts) —— JWT 有效期类型收窄（兼容 jsonwebtoken 的 `StringValue`）

### src/prisma/

- [`prisma.module.ts`](../apps/server/src/prisma/prisma.module.ts) —— 全局 Prisma 模块
- [`prisma.service.ts`](../apps/server/src/prisma/prisma.service.ts) —— PrismaClient 生命周期管理

### src/modules/auth（管理后台登录 JWT-A）

- [`auth.module.ts`](../apps/server/src/modules/auth/auth.module.ts) —— 模块定义（JwtService 由全局 CommonModule 提供，此处不重复注册）
- [`auth.service.ts`](../apps/server/src/modules/auth/auth.service.ts) —— 登录校验（bcrypt）、JWT 签发、用户信息
- [`auth.controller.ts`](../apps/server/src/modules/auth/auth.controller.ts) —— `POST /auth/login`、`GET /auth/me`

### src/modules/sites（站点管理）

- [`sites.module.ts`](../apps/server/src/modules/sites/sites.module.ts) —— 模块定义
- [`sites.controller.ts`](../apps/server/src/modules/sites/sites.controller.ts) —— 站点列表/详情/新建/编辑/删除（写操作限平台管理员）
- [`sites.service.ts`](../apps/server/src/modules/sites/sites.service.ts) —— 站点 CRUD、**别名域名规范化与全局唯一校验**（随站点全量同步）、文件引用解析、JSON 字段与时间格式化、**列表/详情附加 `build`（最新构建任务摘要，批量取避免 N+1）**
- [`dto.ts`](../apps/server/src/modules/sites/dto.ts) —— 入参校验 DTO（QuerySiteDto / CreateSiteDto / UpdateSiteDto）
- [`constants.ts`](../apps/server/src/modules/sites/constants.ts) —— 站点默认值（AI 策略放行、主题令牌、渲染模式）

### src/modules/static-files（静态文件）

- [`static-files.module.ts`](../apps/server/src/modules/static-files/static-files.module.ts) —— 模块定义
- [`static-files.controller.ts`](../apps/server/src/modules/static-files/static-files.controller.ts) —— 上传（multipart）、列表、删除、**替换（`PUT /files/:id/replace`：URL 不变仅覆盖文件，MIME 必须与原记录一致）**
- [`static-files.service.ts`](../apps/server/src/modules/static-files/static-files.service.ts) —— 写入 `uploads/yyyy/mm/uuid.ext`、记录 URL 表、类型与体积校验、**原路径覆盖替换（更新 sizeBytes / originalName）**

### src/modules/content（内容：栏目与页面）

- [`content.module.ts`](../apps/server/src/modules/content/content.module.ts) —— 模块定义
- [`content.controller.ts`](../apps/server/src/modules/content/content.controller.ts) —— 栏目树/页面 CRUD/状态流转/GEO 体检接口
- [`content.service.ts`](../apps/server/src/modules/content/content.service.ts) —— 栏目树构建、页面查询（附 GEO 分）、三态流转、编辑页 URL 锁定（ADR-025）与 `path` 物化
- [`editor.controller.ts`](../apps/server/src/modules/content/editor.controller.ts) / [`editor.service.ts`](../apps/server/src/modules/content/editor.service.ts) —— 工作台：内容树、目录与页面增删改移、整页草稿读写与放弃、地址锁定、路径重算
- [`dto.ts`](../apps/server/src/modules/content/dto.ts) —— 栏目与页面 DTO

### src/modules/news-faq（新闻资讯 / 高频问答管理）

- [`news-faq.module.ts`](../apps/server/src/modules/news-faq/news-faq.module.ts) —— 模块定义（依赖 Content / Publish 模块，导出同步服务）
- [`news-faq.controller.ts`](../apps/server/src/modules/news-faq/news-faq.controller.ts) —— `/news-faq/*` 接口：文章与问答的分页列表（读管理表）、单条详情（`articles/:id/detail` / `faqs/:id/detail` **直读表，不接收 siteId 参数**，按记录归属站点鉴权）、增删改、分类清单
- [`news-faq.service.ts`](../apps/server/src/modules/news-faq/news-faq.service.ts) —— 管理面 CRUD（**表驱动**：`NewsArticle` / `FaqItem` 为管理源）：列表/详情直读表 → 写表 → 委托同步服务创建或补建 kind=detail 发布产物页（保存即发布、slug 自动生成；**slug 创建后不可改**）、按 `pageId` 弱关联挂接失联产物 → 重算派生块 → 自动触发**页面级**发布（响应携带 `affectedPages` 与 `publishTaskId`）
- [`news-faq-sync.service.ts`](../apps/server/src/modules/news-faq/news-faq-sync.service.ts) —— **派生块同步（核心）**：详情页标准块组合生成；详情数据装载 `loadNewsDetails` / `loadFaqDetails` **直读管理表**（表是唯一事实来源）；`/news` 列表（post-list 按发布日期倒序、hero chips 置空、移除独立 pager）、`/faq` 列表（eyebrow/anchor-bar/hot-faq/分类分组 section-head+faq-index 整体重算）、同分类详情页 related-faq 重算；Prisma 事务写回并重算内容指纹（块实例 id 同 key 顺序复用，常规编辑下指纹稳定）
- [`news-faq.constants.ts`](../apps/server/src/modules/news-faq/news-faq.constants.ts) —— 详情页标准块组合的固定文案常量（notice / telbar / hero 说明与动作，与既有详情页 1:1）
- [`dto.ts`](../apps/server/src/modules/news-faq/dto.ts) —— 文章 / 问答入参 DTO（含 `YYYY-MM-DD` 格式与「不早于今天」校验、slug 格式校验；编辑 DTO 不收 slug）

### src/modules/blocks（块定义 / 块库 · 块隔离见 ADR-035）

- [`constants.ts`](../apps/server/src/modules/blocks/constants.ts) —— `PUBLIC_BLOCK_SITE_ID = 0`：**公共模板（模板库）**的 siteId 约定值（不用 NULL，唯一索引不约束多个 NULL）
- [`block-copy.ts`](../apps/server/src/modules/blocks/block-copy.ts) —— **块副本唯一实现** `copyTemplatesToSite(db, siteId, keys)`（幂等）：把公共模板复制为站点自有块（`scope=site`、`version=1` + 版本留档）；被保存草稿 / 建站导入 / 发布兜底 / 手动引入 / 回填与种子共用
- [`blocks.service.ts`](../apps/server/src/modules/blocks/blocks.service.ts) —— 列表（本站块 + 公共模板）/ 详情（`template=1` 只读模板）/ 新建 / 保存（站点维度**先复制副本再落笔**）/ 使用位置 / 回退上一版（`save` 与 `rollback` 共用 `archiveVersion`，先归档被覆盖的那一版）/ `apply`（模板引入本站）/ 渲染引擎清单与代码指纹（本站块优先 + 模板兜底）；模板库（`siteId=0`）读写限平台级
- [`blocks.controller.ts`](../apps/server/src/modules/blocks/blocks.controller.ts) —— 上述接口（含 `POST /blocks/:key/apply`）
- [`blocks-internal.controller.ts`](../apps/server/src/modules/blocks/blocks-internal.controller.ts) —— 渲染引擎内部清单接口（`GET /internal/blocks`，内部 token）
- [`sfc.ts`](../apps/server/src/modules/blocks/sfc.ts) / [`dto.ts`](../apps/server/src/modules/blocks/dto.ts) —— SFC 编译校验与入参 DTO

### src/modules/members（站点会员，管理侧）

- [`members.module.ts`](../apps/server/src/modules/members/members.module.ts) / [`members.controller.ts`](../apps/server/src/modules/members/members.controller.ts) / [`members.service.ts`](../apps/server/src/modules/members/members.service.ts) —— 会员列表、新增、删除（按站点隔离）

### src/modules/site-auth（站点会员鉴权 JWT-M）

- [`site-auth.module.ts`](../apps/server/src/modules/site-auth/site-auth.module.ts) —— 独立 JwtModule（会员密钥与 admin 隔离）
- [`site-auth.service.ts`](../apps/server/src/modules/site-auth/site-auth.service.ts) —— 注册、登录、token 校验、会员信息
- [`site-auth.controller.ts`](../apps/server/src/modules/site-auth/site-auth.controller.ts) —— `POST /site-auth/register`、`/login`、`GET /site-auth/me`

### src/modules/publish（发布管线）

- [`publish.module.ts`](../apps/server/src/modules/publish/publish.module.ts) —— 模块定义
- [`publish.controller.ts`](../apps/server/src/modules/publish/publish.controller.ts) —— 页面级发布、整站重建、任务列表
- [`publish.service.ts`](../apps/server/src/modules/publish/publish.service.ts) —— 任务入队（入队前**兜底补齐本站块副本**，失败只告警不阻断，ADR-035；**手动入口同站点互斥**：站点有 `pending`/`running` 任务时返回 409，系统入口（建站导入）可排队）、**串行执行**（同站点串行链 `scheduleNext`）、调用 GEO 构建脚本（注入 API 基址、超时强杀 `BUILD_TIMEOUT_MS`）、启动恢复（悬死任务复位 pending）、全链路 try/catch 与状态防重入、记录日志（ADR-032 失败隔离）、**构建状态查询**（`latestTask` / `latestTaskBySites`，供站点列表与编辑器标记进度）、`repair` 与构建互斥、构建成功后 `syncPublishedHashes` 回写 `publishedHash`（清单 pageId 先按库存活过滤，站点数据重建后失联的历史 id 跳过回写，不再抛错阻断）

### src/modules/track（埋点与 AI 爬虫监控）

- [`track.module.ts`](../apps/server/src/modules/track/track.module.ts) —— 模块定义
- [`track.controller.ts`](../apps/server/src/modules/track/track.controller.ts) —— 公开上报接口（限流）、PV/UV 概览、AI 抓取概览、批量入库
- [`track.service.ts`](../apps/server/src/modules/track/track.service.ts) —— 内存队列攒批写入、AI 事件记录、分组统计

### src/modules/entities（实体一致性）

- [`entities.module.ts`](../apps/server/src/modules/entities/entities.module.ts) / [`entities.controller.ts`](../apps/server/src/modules/entities/entities.controller.ts) / [`entities.service.ts`](../apps/server/src/modules/entities/entities.service.ts) —— 品牌/产品实体与别名维护

### src/modules/menus（后台菜单）

- [`menus.module.ts`](../apps/server/src/modules/menus/menus.module.ts) —— 模块定义
- [`menus.controller.ts`](../apps/server/src/modules/menus/menus.controller.ts) —— 侧栏菜单树（按角色过滤）+ 菜单配置增删改查（写操作限平台管理员）
- [`menus.service.ts`](../apps/server/src/modules/menus/menus.service.ts) —— 菜单树构建、层级与环路校验（最多三级）、存在子菜单时拒绝删除
- [`dto.ts`](../apps/server/src/modules/menus/dto.ts) —— 菜单入参校验 DTO

### src/modules/roles（后台角色）

- [`roles.module.ts`](../apps/server/src/modules/roles/roles.module.ts) —— 模块定义
- [`roles.controller.ts`](../apps/server/src/modules/roles/roles.controller.ts) —— 角色增删改查 + 角色-菜单授权（全部限平台级角色）
- [`roles.service.ts`](../apps/server/src/modules/roles/roles.service.ts) —— 角色 CRUD、菜单授权保存（自动补全上级菜单）、内置角色与用户绑定的删除护栏
- [`dto.ts`](../apps/server/src/modules/roles/dto.ts) —— 角色入参校验 DTO

### src/modules/admin-users（后台用户）

- [`admin-users.module.ts`](../apps/server/src/modules/admin-users/admin-users.module.ts) —— 模块定义
- [`admin-users.controller.ts`](../apps/server/src/modules/admin-users/admin-users.controller.ts) —— 用户增删改查与角色分配（全部限平台级角色）
- [`admin-users.service.ts`](../apps/server/src/modules/admin-users/admin-users.service.ts) —— 用户 CRUD、bcrypt 密码、角色绑定校验、站点授权、删除/降级护栏（不能删自己、必须保留至少一个可用平台级用户）
- [`dto.ts`](../apps/server/src/modules/admin-users/dto.ts) —— 用户入参校验 DTO

### src/modules/public（GEO 项目公开只读接口）

- [`public.module.ts`](../apps/server/src/modules/public/public.module.ts) —— 模块定义
- [`public.controller.ts`](../apps/server/src/modules/public/public.controller.ts) —— 站点配置、路由清单、页面详情、robots、实体（无鉴权）
- [`public.service.ts`](../apps/server/src/modules/public/public.service.ts) —— 读取站点与已发布内容，裁剪敏感字段；**站点标识解析支持 slug / 主域名 / 别名域名**（GEO 项目按请求 Host 反查站点）；`routes()` 输出每页 `contentHash` 与 `blocks[].codeHash`（构建脚本据此写产物清单，ADR-033）

### src/modules/health

- [`health.module.ts`](../apps/server/src/modules/health/health.module.ts) / [`health.controller.ts`](../apps/server/src/modules/health/health.controller.ts) / [`health.service.ts`](../apps/server/src/modules/health/health.service.ts) —— 健康检查（Docker healthcheck 使用）

### uploads/（运行时生成）

- 本地静态文件物理存储（生产可由 nginx 直接映射；未来切对象存储只需改 public_url 生成规则）

---

## /apps/admin（管理后台）

Nuxt 4 + Element Plus（**亮色主题**），SPA（`ssr: false`，见 ADR-017），负责站点/内容/会员管理、系统设置（用户/角色/菜单）与 GEO 监控。

### 工程文件

- [`package.json`](../apps/admin/package.json) —— 依赖与脚本（dev / build / `start:prod`：`node .output/server/index.mjs`，供上线器以生产模式常驻）
- [`nuxt.config.ts`](../apps/admin/nuxt.config.ts) —— SPA（`ssr: false`，见 ADR-017）、**基础路径 `/geocms/`（`app.baseURL`，ADR-040）**、Pinia 模块（`@pinia/nuxt`）、element-plus/dayjs 依赖预构建、Element Plus CSS 顺序、SCSS 令牌全局注入、`apiBase` 运行时配置、开发端口（读注入的 `PORT`）
- [`tsconfig.json`](../apps/admin/tsconfig.json) —— TS 配置
- [`eslint.config.mjs`](../apps/admin/eslint.config.mjs) —— ESLint 配置

> 约定：`app/config/` 下的文件在页面/布局/组件中一律用 `~` 别名导入（`~/config/api`、`~/config/menu`）。
> 相对路径 `../../config/api` 会被 Nuxt 的 import-protection（impound）误判为 Nuxt 构建期模块，直接构建失败。
> 环境变量统一来自仓库根 `env/`，工程内不再有 `.env`。

### app/（Nuxt 4 应用目录）

- [`app.vue`](../apps/admin/app/app.vue) —— 应用根组件（统一走控制台布局）

### app/assets/scss（样式与设计令牌）

- [`tokens.scss`](../apps/admin/app/assets/scss/tokens.scss) —— **设计令牌（亮色主题）**：字号（基准 12px）、间距（8px 栅格）、配色、圆角、密度、字体；颜色唯一事实来源
- [`mixins.scss`](../apps/admin/app/assets/scss/mixins.scss) —— 面板、等宽数字、省略、密集表格等复用片段
- [`main.scss`](../apps/admin/app/assets/scss/main.scss) —— 全局 reset + Element Plus **亮色主题**变量覆盖（主色 light/dark 梯度经 `color.mix()` 从 `$c-primary` 派生）+ 紧凑密度规则 + **表单标签与控件垂直对齐**（左侧标签居中，顶部标签留 4px）+ 表格 border 样式基线 + 语义色工具类（`.c-success` / `.c-warning` / `.c-danger` / `.c-primary` / `.c-mute`）+ 专有名词问号与长文本弹层基线（`.term-mark` / `.term-tooltip` / `.text-tooltip`：弹层宽度 150–300px、行高 1.6、自动换行）+ **表格操作列统一规格**（`.ops-col`：`flex-wrap` 换行 + 禁止省略号 + gap 4/6px，页面只给列宽）

### app/config（配置化内容统一在此）

- [`api/http.ts`](../apps/admin/app/config/api/http.ts) —— **请求唯一出口**：baseURL（缺失即报错、指向回环地址时按浏览器主机名自适应以便同局域网访问）、token 注入、401 跳转（`currentRoutePath()` 剥 `/geocms` 前缀后判定，避免基础路径误判）、错误提示、get/post/patch/del/upload
- [`api/auth.ts`](../apps/admin/app/config/api/auth.ts) —— 登录、当前用户接口
- [`api/sites.ts`](../apps/admin/app/config/api/sites.ts) —— 站点相关接口（`SiteItem.build` = 最新构建任务摘要，站点列表「构建状态」列的数据来源）
- [`api/files.ts`](../apps/admin/app/config/api/files.ts) —— 静态文件上传/列表/删除/替换（`replace` → `PUT /files/:id/replace`，URL 不变仅换文件）接口
- [`api/content.ts`](../apps/admin/app/config/api/content.ts) —— 栏目与页面接口
- [`api/members.ts`](../apps/admin/app/config/api/members.ts) —— 站点会员接口
- [`api/publish.ts`](../apps/admin/app/config/api/publish.ts) —— 发布任务接口 + 产物状态（`artifacts`，含 `task` = 最新构建任务）、单页回退（`rollback`）、GEO 索引更新（`repair`，界面旧称「产物修复」）、产物包下载（`download`）
- [`api/editor.ts`](../apps/admin/app/config/api/editor.ts) —— 站点内容编辑器接口：内容树、目录/页面增删改与上下移、整页草稿读写与丢弃、内容指纹重算
- [`api/blocks.ts`](../apps/admin/app/config/api/blocks.ts) —— 块库接口：列表（本站块 + 公共模板）/详情（含源码与字段声明，`template: true` 只读模板）/新建/保存代码（编译失败返回 `compileError` 含行号列号）/使用位置/回退上一版/**模板引入本站**（`apply`，ADR-035）
- [`api/navigations.ts`](../apps/admin/app/config/api/navigations.ts) —— 导航配置接口：五个分组列表与整组全量覆盖保存
- [`api/preview.ts`](../apps/admin/app/config/api/preview.ts) —— 预览票据接口（后台发起 → iframe 加载票据地址）
- [`api/geo.ts`](../apps/admin/app/config/api/geo.ts) —— GEO 文档生成预览（纯计算不落盘，返回 `auto` 与 `output`）
- [`api/track.ts`](../apps/admin/app/config/api/track.ts) —— 埋点与监控统计接口
- [`api/menus.ts`](../apps/admin/app/config/api/menus.ts) —— 菜单树与菜单配置维护接口
- [`api/roles.ts`](../apps/admin/app/config/api/roles.ts) —— 角色 CRUD 与角色-菜单授权接口
- [`api/users.ts`](../apps/admin/app/config/api/users.ts) —— 后台用户 CRUD 与角色绑定接口
- [`api/news-faq.ts`](../apps/admin/app/config/api/news-faq.ts) —— 新闻资讯 / 高频问答接口（**表驱动 id 寻址**：读 `NewsArticle` / `FaqItem` 表，列表 / 按 `id` 详情（不传 siteId）/ 增删改；列表不返回正文，编辑回显走 `articleDetail` / `faqDetail`；`pageId` 为发布产物弱引用；保存后由服务端同步派生块并自动页面级发布）
- [`api/index.ts`](../apps/admin/app/config/api/index.ts) —— API 统一出口
- [`menu.ts`](../apps/admin/app/config/menu.ts) —— 渲染模式/状态等字典映射（含 **`BUILD_STATUS_META`：构建状态唯一口径**——未构建 / 排队中 / 构建中 / 构建成功 / 构建失败，站点列表、内容编辑器、总览发布任务三处共用）；**侧栏菜单与角色名均已改为后台数据驱动，不在此硬编码**；状态色只给 `.c-*` 语义类名）
- [`site-defaults.ts`](../apps/admin/app/config/site-defaults.ts) —— 站点主题默认值（与服务端 `SITE_DEFAULTS.theme` 对齐；唯一允许写颜色字面量的 TS 文件）
- [`pagination.ts`](../apps/admin/app/config/pagination.ts) —— **分页统一配置**：默认每页 20、档位 `[10, 20, 30, 50, 100]`、`el-pagination` 统一 layout（与服务端 `common/constants.ts` 对齐）
- [`glossary.ts`](../apps/admin/app/config/glossary.ts) —— **专有名词字典（界面文案唯一事实来源，58 条）**：`TERMS.<key>` = `{ label, hint }`，按「地址与域名 / 内容 / 平台与 GEO / 块 / 导航 / 监控与运行 / 权限」分组（slug / canonical / 产物清单 / 内容指纹 / 块标识 / 公共模板 / PV / 站点授权 …）；页面禁止硬编码名词与解释，配合 `components/TermHint.vue` 出问号说明；文档侧同口径解释见 [`GLOSSARY.md`](./GLOSSARY.md)

### app/utils

- [`menu-tree.ts`](../apps/admin/app/utils/menu-tree.ts) —— 菜单树工具：平铺列表 ↔ 多级树（菜单管理与角色授权页共用）
- [`tool.ts`](../apps/admin/app/utils/tool.ts) —— 交互工具（**防抖与 loading 相互独立**）：`debounce` / `throttle`（时间维度，默认 `leading` 即先触发后防抖）与 `useLoading()`（状态维度：`run` 整块互斥 / `runKeyed` 行级互斥 / `isLoading` 行内 loading）；全部写操作按钮统一从这里引入，组合顺序为「防抖在外、loading 在内」

### app/plugins

- [`element-plus.ts`](../apps/admin/app/plugins/element-plus.ts) —— 注册 Element Plus（中文语言包）
- Pinia **不在此处注册**：由 `nuxt.config.ts` 的 `@pinia/nuxt` 模块接入（自动创建实例 + 自动导入 `app/stores/**`，禁止再手写 `createPinia` 插件）

### app/stores

- [`auth.ts`](../apps/admin/app/stores/auth.ts) —— 登录状态：token 持久化（localStorage）、用户信息（含 `roleName` / `platform`）；由 `@pinia/nuxt` 自动导入
- [`menu.ts`](../apps/admin/app/stores/menu.ts) —— 菜单树状态：登录后拉取 `/geoserver/menus/tree`（按当前用户角色授权过滤）并缓存，提供面包屑标题查询与退出时重置

### app/components（弹窗一律独立组件，规范见 AGENTS.md §7）

- [`SideMenuNode.vue`](../apps/admin/app/components/SideMenuNode.vue) —— 侧栏菜单递归节点（最多三级，目录可展开/收起，命中路由高亮）
- [`DashboardOverview.vue`](../apps/admin/app/components/DashboardOverview.vue) —— GEO 监控工作台仪表盘（PV/UV + AI 抓取 + 发布任务）；**当前未挂载**：根路径 `/` 改为空白占位页（`pages/index.vue`），需要恢复时在页面模板写 `<DashboardOverview />`
- [`MemberCreateDialog.vue`](../apps/admin/app/components/MemberCreateDialog.vue) —— 新增站点会员弹窗
- [`PlainTextEditor.vue`](../apps/admin/app/components/PlainTextEditor.vue) —— **纯文本编辑器（wangEditor 封装）**：v-model 只暴露纯文本（初始化 `\n` 段落转 `<p>`、onchange 用 `editor.getText()` 输出段落间 `\n` 的纯文本）；工具栏精简为标题 + 基础强调按钮；编辑器实例 `shallowRef` 持有、组件销毁时 `destroy()`；外部值变化（编辑异步回显）经 watch 用 `setHtml` 同步
- [`NewsDialog.vue`](../apps/admin/app/components/NewsDialog.vue) —— 新闻新建/编辑弹窗（标题 / URL 片段（仅创建，留空自动生成）/ 发布日期 / 摘要 / 正文 `PlainTextEditor`；编辑打开时拉单条详情回显正文）
- [`FaqDialog.vue`](../apps/admin/app/components/FaqDialog.vue) —— 高频问筷新建/编辑弹窗（问题 / 分类（allow-create 可输入新分类）/ 答案 `PlainTextEditor`；编辑打开时拉单条详情回显答案）
- [`MenuFormDialog.vue`](../apps/admin/app/components/MenuFormDialog.vue) —— 菜单新建/编辑弹窗（上级菜单树选择 + 环路排除）
- [`RoleFormDialog.vue`](../apps/admin/app/components/RoleFormDialog.vue) —— 角色新建/编辑弹窗（内置角色标识与状态受保护）
- [`RoleMenusDialog.vue`](../apps/admin/app/components/RoleMenusDialog.vue) —— 角色菜单授权弹窗（勾选子级自动含上级）
- [`AdminUserFormDialog.vue`](../apps/admin/app/components/AdminUserFormDialog.vue) —— 后台用户新建/编辑弹窗（角色绑定 + 站点授权）
- [`BlockDataForm.vue`](../apps/admin/app/components/BlockDataForm.vue) —— **动态块数据表单**：按 `BlockFieldSchema` 递归渲染 text/textarea/number/switch/select/file/url/link/list/group，`list` 支持增删与上下移；对外暴露 `collectMissing()` 供保存前收集未填必填项
- [`ChannelFormDialog.vue`](../apps/admin/app/components/ChannelFormDialog.vue) —— 目录新建/编辑弹窗（名称 + URL 片段 + 排序）
- [`PageFormDialog.vue`](../apps/admin/app/components/PageFormDialog.vue) —— 页面新建/编辑弹窗（标题/URL 片段/所属目录/类型/摘要；已发布页锁定 slug 与目录）
- [`BlockCreateDialog.vue`](../apps/admin/app/components/BlockCreateDialog.vue) —— 新建块弹窗（归属 + SFC 源码模板，标识取自源码声明；编译失败展示行号列号）；`defaultScope` / `lockScope` 供块模板库锁定为「公共模板」，非平台级不提供公共模板选项（ADR-035）
- [`BlockUsagesDialog.vue`](../apps/admin/app/components/BlockUsagesDialog.vue) —— 块使用位置弹窗（引用页面 + 实例数/启用数）
- [`GeoPreviewDialog.vue`](../apps/admin/app/components/GeoPreviewDialog.vue) —— GEO 预览弹窗（只读展示「系统自动生成」与「实际会输出」）
- [`GeoArtifactsDialog.vue`](../apps/admin/app/components/GeoArtifactsDialog.vue) —— GEO 产物弹窗（查看已构建产物里的 robots.txt / sitemap.xml / llms.txt；「GEO 索引更新」重出索引；「编辑」为非常规兜底的手动替换，会被下次索引更新 / 重建覆盖）
- [`SiteDownloadDialog.vue`](../apps/admin/app/components/SiteDownloadDialog.vue) —— 站点下载弹窗（分包模式：完整包 / 纯静态包；未构建提示先发布、有未发布改动二次确认）
- [`TermHint.vue`](../apps/admin/app/components/TermHint.vue) —— **专有名词说明（问号说明的唯一实现）**：渲染「名词 + ?」，hover/聚焦显示含义；`show-label=false` 只出问号（按钮内用）；问号自带 `@click.stop`，落在按钮里不会误触发动作；文案取自 `~/config/glossary.ts`，弹层统一 `popper-class="term-tooltip"`（宽度 150–300px、行高 1.6、自动换行由 `main.scss` 定义，页面禁止自拼 tooltip；非术语的长文本气泡用同套排版的 `.text-tooltip`，如构建失败原因），用于表单标签（`#label`）、表格表头（`#header`）、正文内联与按钮

### app/middleware

- [`auth.global.ts`](../apps/admin/app/middleware/auth.global.ts) —— 全局路由守卫：未登录跳转登录页

### app/layouts

- [`default.vue`](../apps/admin/app/layouts/default.vue) —— 控制台布局：角色化侧栏菜单 + 顶栏 + 内容区

### app/pages

> 页面级约定：列表表格统一 `el-table` + `border`（列宽可拖拽，样式基线在 `main.scss`）；弹窗一律使用 `app/components/*Dialog.vue` 独立组件，页面只保留 `v-model` 与 `@saved`。

- [`login.vue`](../apps/admin/app/pages/login.vue) —— 登录页（深空控制台风格）
- [`index.vue`](../apps/admin/app/pages/index.vue) —— 总览仪表盘：PV/UV、AI 抓取、发布任务、热门路由
- [`sites/index.vue`](../apps/admin/app/pages/sites/index.vue) —— 站点列表（搜索/筛选/分页；**域名映射列**：主域名 + 别名域名；**站点前缀列**：站点标识 `slug`，进编辑页可改；**构建状态列**：未构建 / 排队中 / 构建中 / 构建成功 / 构建失败 + 时间（进行中显示已运行时长，失败悬停看日志尾部；有进行中任务时每 4 秒静默轮询）；渲染模式列与模式筛选本期隐藏（纯 SSG）；操作列「预览」新标签打开**主域名 + 站点前缀**、「编辑」进入深入编辑页、「内容编辑器」进入 `/content/editor?siteId=<id>`、「下载」打开 `SiteDownloadDialog` 下载产物包）
- [`sites/[id].vue`](../apps/admin/app/pages/sites/%5Bid%5D.vue) —— 站点深入编辑页（单页三分区、无 Tab：基本信息（含**站点前缀 slug**、**主域名 + 别名域名增删**）/ 企业资质 / SEO 设置；渲染模式与主题色不在此页）
- [`sites/news.vue`](../apps/admin/app/pages/sites/news.vue) —— 新闻资讯管理（按站点隔离：站点切换 + 关键词搜索；表格列标题 / 访问路径 / 发布日期 / 发布状态徽标；操作编辑、删除（删除与保存均由服务端自动触发站点构建）；弹窗 `NewsDialog`）
- [`sites/faqs.vue`](../apps/admin/app/pages/sites/faqs.vue) —— 高频问答管理（按站点隔离：站点切换 + 关键词搜索 + 分类筛选（选项来自分类接口，清空 = 全部）；表格列问题 / 分类 / 访问路径 / 发布状态徽标；操作编辑、删除；弹窗 `FaqDialog`，新分类保存后刷新分类清单）
- [`content/index.vue`](../apps/admin/app/pages/content/index.vue) —— 页面列表（状态三态、GEO 分、提交审核与发布）
- [`content/[id].vue`](../apps/admin/app/pages/content/%5Bid%5D.vue) —— 页面编辑器（模板 + 结构化 Block 表单 + 右侧 GEO 体检）
- [`content/editor.vue`](../apps/admin/app/pages/content/editor.vue) —— **站点内容编辑器工作台**（09 §6.2）：工具条（站点切换 + **构建状态**（未构建 / 排队中 / 构建中 / 构建成功 / 构建失败 + 时间或已运行时长，失败可悬停看原因；进行中每 3 秒轮询并在结束时刷新左树与徽标 + 提示结果）+ **增量发布**（带 `?` 说明）+ **整站重建** / **GEO 索引更新**（接通既有 `/publish/site`、`/publish/repair` 接口，三个动作各带 `?` 说明，问号统一由 `TermHint` 渲染；**进行中三个按钮全部禁用**，增量发布与整站重建转圈）+ 刷新）、左列可搜索内容树（目录/页面/块 + 发布徽标，点目录即打开其下第一个页面）、右侧预览 iframe 占满一屏（走 `/preview/ticket`，头部展示预览态标记 + 页面**访问地址**可复制）、「页面 / 块 / 发布」改为右侧抽屉（页面：草稿字段 + SEO + 编审 + JSON-LD 双模式；块：实例清单（块标识下列出**块名称与用途说明**，定义批量预取）+ 动态数据表单 + 「编辑代码」新标签页打开块代码；发布：状态 + 发布/回退 + GEO 体检）
- [`blocks/index.vue`](../apps/admin/app/pages/blocks/index.vue) —— **块库（本站块）**：本站块 + 公共模板（归属筛选 / 「已引入」标记 / 未引入可「引入本站」）；操作：使用位置、编辑代码（新标签页）、引入本站、回退上一版
- [`blocks/templates.vue`](../apps/admin/app/pages/blocks/templates.vue) —— **块模板库**（平台级）：公共模板（`siteId=0`）的新建 / 编辑代码（新标签页）/ 回退上一版；模板只作初始代码，改模板不影响已引入的站点（ADR-035）
- [`blocks/[key].vue`](../apps/admin/app/pages/blocks/%5Bkey%5D.vue) —— 块代码编辑器（源码 textarea + 行号 gutter + 错误行标红；右侧只读字段声明表；下方使用位置；`siteId=0` 编模板、其余编本站块，未引入时提示「保存会复制一份到本站」；由列表以新标签页打开）
- [`files.vue`](../apps/admin/app/pages/files.vue) —— 素材管理（`static_files` 可视化入口）：站点筛选 + 关键词搜索 + 多选上传、图片缩略预览、复制访问地址、替换（隐藏 file input，accept 限定原文件 MIME，`PUT /files/:id/replace` 替换内容、引用地址不变）、删除；接口早已就绪（上传 / 列表 / 删除），此前仅站点编辑页用了上传
- [`navigations.vue`](../apps/admin/app/pages/navigations.vue) —— 导航管理（头部主导航 + 页脚四列分组，条目增删排序、站内页面/外部链接二选一，整组全量覆盖保存）
- [`members/index.vue`](../apps/admin/app/pages/members/index.vue) —— 站点会员管理
- [`monitor/index.vue`](../apps/admin/app/pages/monitor/index.vue) —— GEO 监控（AI 爬虫分布、被抓取页面 Top）
- [`settings/index.vue`](../apps/admin/app/pages/settings/index.vue) —— 系统设置 · 运行配置（平台级，展示账号与角色/接口基址/时区/静态资源/AI 爬虫策略）
- [`settings/users.vue`](../apps/admin/app/pages/settings/users.vue) —— 系统设置 · 用户管理（平台级，用户增删改查、分配角色与站点授权、启停）
- [`settings/roles.vue`](../apps/admin/app/pages/settings/roles.vue) —— 系统设置 · 角色管理（平台级，角色增删改查 + 菜单授权树，内置角色受保护）
- [`settings/menus.vue`](../apps/admin/app/pages/settings/menus.vue) —— 系统设置 · 菜单管理（平台级，三级菜单增删改查，保存后侧栏即时生效；可见性由角色授权决定）

---

## /apps/geo（GEO 项目）

站点渲染引擎：一套代码渲染多站点，支持站点级 **SSG / SSR 双模式**。

### 工程文件

- [`package.json`](../apps/geo/package.json) —— 依赖与脚本（含 `build:sites` 增量 SSG、`build:site` 指定站点、`start:prod`：`node .output/server/index.mjs` 供上线器常驻 SSR）
- [`nuxt.config.ts`](../apps/geo/nuxt.config.ts) —— SSG 产物目录、prerender 钩子（从服务端拉路由清单）、构建期环境变量、开发端口（读注入的 `PORT`）、组件自动导入（**`pathPrefix: false`**，否则 `blocks/BlockXxx.vue` 注册名带前缀导致 Block 渲染链路失效）
- [`tsconfig.json`](../apps/geo/tsconfig.json) —— TS 配置
- [`eslint.config.mjs`](../apps/geo/eslint.config.mjs) —— ESLint 配置

### app/

- [`app.vue`](../apps/geo/app/app.vue) —— 根组件：注入站点主题 CSS 变量（一套代码多站点外观）+ 引入站点样式层（原型 CSS，09 §7.4.1）+ **显式 `<NuxtLayout>`**（否则 `definePageMeta({ layout })` 静默失效，站点页头/页脚与 `<main>` 不会渲染）
- [`layouts/default.vue`](../apps/geo/app/layouts/default.vue) —— 站点布局：框架块组合（门诊条 + 页头 + `<main>` 内容 + 页脚，含备案号，合规与信任信号）

### app/middleware

- [`site-prefix.global.ts`](../apps/geo/app/middleware/site-prefix.global.ts) —— **站点前缀统一补齐（全局）**：回环地址下把缺前缀的页面路径改写成 `/<slug><path>`（query/hash 保留，预览票据不丢），覆盖首屏 SSR、客户端导航、刷新与新窗口；非回环、SSG 构建期、预览/静态资源路径直通（见 ADR-031）

### app/composables

- [`useSiteKey.ts`](../apps/geo/app/composables/useSiteKey.ts) —— 站点上下文解析（站点标识 + URL 站点前缀）：SSR 按请求 Host；回环地址按 URL 首段定位站点并剥离该前缀，**前缀恒等于站点标识**（含环境变量指定的默认站点，缺前缀路径由上面的中间件补齐）；构建期回退环境变量；另出 `stripSitePrefix`
- [`useSite.ts`](../apps/geo/app/composables/useSite.ts) —— 站点配置读取（全局共享；请求前先解析站点上下文）
- [`usePage.ts`](../apps/geo/app/composables/usePage.ts) —— 页面详情读取（剥离站点前缀 → 路径解析 + Block 数据）

### app/components

> **语义化要求**：GEO 侧组件（含全部 Block）必须严格遵循 HTML5 语义化规范（一页仅 1 个 h1、Block 标题从 h2 起、`address`/`time`/`figure`/`dl` 用在该用的地方、表单必须有 `label`），完整清单见 [`spec/03-frontend-architecture.md`](./spec/03-frontend-architecture.md) §4；管理后台豁免该要求。

- [`PageRender.vue`](../apps/geo/app/components/PageRender.vue) —— 页面渲染：加载数据 → 注入 GEO 元数据（meta/JSON-LD/canonical，统一经 `useHead` 注入，模板内禁止写 `<script>`）→ 渲染 Block（页面唯一 `h1` 与 `time` 发布时间在此）
- [`MemberBadge.client.vue`](../apps/geo/app/components/MemberBadge.client.vue) —— 会员入口（客户端 island：静态站登录后由浏览器调用 member API；登录表单含 `label` 绑定）
- [`blocks/BlockRenderer.vue`](../apps/geo/app/components/blocks/BlockRenderer.vue) —— Block 分发渲染器：`import.meta.glob('./Blk*.vue')` 构建期收集块组件表，按 `Blk<PascalCase(key)>` 动态解析（不用 `resolveComponent`，缺失块渲染为显式占位而非静默空白），跳过停用块，输出 `data-block-id`
- [`blocks/Blk*.vue`（41 个，构建期由 `scripts/sync-blocks.mjs` 落盘，gitignore）](../apps/geo/app/components/blocks/) —— 内容块组件。**HTML 结构复用设计稿原型类名（09 §7.4.1，ADR-036）**：`BlkAnchorBar` `BlkArticleBody` `BlkArticleMeta` `BlkCaseCard` `BlkCertGrid` `BlkDataTable` `BlkDeviceRow` `BlkDoctorCard` `BlkEntityBanner` `BlkEnvGrid` `BlkFaqDetail` `BlkFaqIndex` `BlkFaqList` `BlkFeatureCards` `BlkFlowChain` `BlkGallery` `BlkGlassCard` `BlkHeroDark` `BlkHeroPanel` `BlkHotFaq` `BlkIndexList` `BlkJobList` `BlkLegalDoc` `BlkListRows` `BlkNapGrid` `BlkNotice` `BlkPager` `BlkPathCards` `BlkPostList` `BlkRelatedFaq` `BlkRouteRows` `BlkSectionHead` `BlkServiceCard` `BlkSideNews` `BlkSourceGrid` `BlkStatBar` `BlkStepTimeline` `BlkTagline` `BlkTermCards` `BlkTrustGrid` `BlkVisitCards`
- [`frame/FrameTopBar.vue`](../apps/geo/app/components/frame/FrameTopBar.vue) —— 框架块·门诊信息条（数据来自 `Site.openingHours` / `medicalInsurance`；DOM 对齐原型 `.top`）
- [`frame/FrameSiteHeader.vue`](../apps/geo/app/components/frame/FrameSiteHeader.vue) —— 框架块·头部（`Site` 标识 + `Navigation(header)`；DOM 对齐原型 `header/.head/.logo/.mainnav`）
- [`frame/FrameBreadcrumb.vue`](../apps/geo/app/components/frame/FrameBreadcrumb.vue) —— 框架块·面包屑（`page.path` + `channel.ancestors` 派生；`<nav><ol><li>`，DOM 对齐原型 `.crumb`）
- [`frame/FrameSiteFooter.vue`](../apps/geo/app/components/frame/FrameSiteFooter.vue) —— 框架块·页脚（`Site` + `Navigation(footer-1..4)` + 法定信息；DOM 对齐原型 `footer/.fgrid/.fguide/.flegal`）
- [`layouts/default.vue`](../apps/geo/app/layouts/default.vue) —— 站点外壳：`<FrameTopBar>` + `<FrameSiteHeader>` + `<main>` + `<FrameSiteFooter>`，移动端导航

### app/pages

- [`index.vue`](../apps/geo/app/pages/index.vue) —— 站点首页
- [`[...slug].vue`](../apps/geo/app/pages/%5B...slug%5D.vue) —— 通用页面路由（栏目/页面 slug → 目录层级）

### app/analytics

- [`analytics.ts`](../apps/geo/app/analytics/analytics.ts) —— 埋点插件（构建期条件注册，默认关闭）：路由变化后 sendBeacon 上报（匿名 ID，无个人信息）；env 置 `NUXT_PUBLIC_TRACK_ENABLED=1` 才由 nuxt.config 的 plugins 数组打包进产物，默认构建完全不含埋点代码（不放 plugins/ 自动扫描目录正是为了能整体排除）

### app/utils

- [`api-base.ts`](../apps/geo/app/utils/api-base.ts) —— 服务端 API 基址读取（缺失即报错，统一出口，不再内置默认地址；客户端在回环基址下按浏览器主机名自适应，便于同局域网访问）；`LOOPBACK_HOSTS` 转发自 `@trillion/shared`（唯一实现在 `shared/utils/geo-url.ts`，本工程不另立清单）
- [`theme.ts`](../apps/geo/app/utils/theme.ts) —— 站点主题令牌 → CSS 变量：`DEFAULT_THEME_TOKENS`（设计稿基线）、`themeStyle`（供 `:style` 绑定）、`themeRootCss`（注入 `:root` 的 `<style>` 文本）；**默认值必须与设计稿 `theme-b.css` 及后台/服务端默认值三处一致**（AGENTS.md §7，09 §7.4）
- [`block-context.ts`](../apps/geo/app/utils/block-context.ts) —— 块渲染上下文装配（`context.site / page / channel / block / items / entities / now / locale`，见 09 §5）
- [`head-extra.ts`](../apps/geo/app/utils/head-extra.ts) —— 站点级 head 扩展解析与净化（`parseHeadExtra` / `toHeadGroups`，服务端已剔除脚本）

### public/（设计稿资产直出，2026-10-08 新增）

> 由 Vite 的 `public/` 机制原样复制进产物根，构建后落进 `sites/<slug>/assets/**`（ADR-036 / ADR-037）。
> `build-sites.mjs` 的 `computeAppFingerprint()` 已含 `public`，本目录任何变更会变更 `appHash` 并强制 `nuxt build`。

- `public/assets/css/theme-b.css` —— 设计稿原型基础样式（**原样复制，不得改选择器**，09 §7.4.1）
- `public/assets/css/site.css` —— 设计稿站点级布局样式（同上）
- `public/assets/img/cert/**` —— 资质证件图（18 个；含 `business-license.pdf`）
- `public/assets/img/device/**` —— 设备实拍图（20 个）
- `public/assets/img/doctor/**` —— 医师形象照（4 个）
- `public/assets/img/env/**` —— 院内环境实景图（18 个）

> 站点样式层的引入与派生变量补齐见 [`app.vue`](../apps/geo/app/app.vue) 与 09 §7.4① ② ③。

### scripts

- [`build-sites.mjs`](../apps/geo/scripts/build-sites.mjs) —— **SSG 构建脚本（增量发布入口，ADR-028/032）**：获取跨站点构建锁 → 块代码落盘（`sync-blocks --report` 指纹报告）→ 构建缓存三元组判定（blockHash + appHash + apiBase，命中跳过 Vite）→ SSR 爬取 targets 产出 HTML+payload → 复制现有产物合并 → robots/sitemap/llms → 合并清单 → 清理下线页 → 归档上一版 → 原子替换；任何页面渲染失败非零退出（不落线上）
- [`sync-blocks.mjs`](../apps/geo/scripts/sync-blocks.mjs) —— **块代码落盘**（数据库 → `app/components/blocks/Blk*.vue`，幂等跳过未变化块）；`--report <file>` 输出 `{ blockHash, count, written, skipped }` 指纹供构建缓存判定

### sites/（构建产物，运行时生成）

- `sites/<站点slug>/` —— 每站点独立静态目录，含页面 HTML 与 GEO 产物，可整目录推 CDN（gitignore）
- `sites/<站点slug>/_trillion.json` —— **产物清单**（页面 ↔ 产物一一对应的唯一事实来源；契约见 `packages/shared` 的 `ArtifactManifest`：`buildId/siteId/slug/domain/generatedAt/routes(string[])/pages[]`，每页含 `pageId/path/file/contentHash/fileHash/publishedAt/blocks[].codeHash`，由构建脚本写入）（gitignore）
- `apps/geo/.<站点slug>.build/`（geo 根下）—— 构建缓存：`meta.json` 指纹 + 归档渲染服务（`server/` 等直放根层，Nitro publicDir 相对基准约束），命中即跳过 Vite（gitignore：`apps/geo/.*.build/`）
- `sites/.build.lock` —— 跨站点构建互斥锁（pid + 起始时间；陈旧锁自动接管）（gitignore）
- `sites/<站点slug>/.old/` —— 上一版产物（构建不再删除，用于「回退上一版」）（gitignore）
- `sites/<站点slug>/.history/` —— 页面级归档（按页保留上一版）（gitignore）

---

## 本期新增文件（2026-10-06 · 站点编辑器与块代码化）

> 完整规格见 [`spec/09-site-editor.md`](./spec/09-site-editor.md)；本节只登记文件落点，实现时逐条补齐说明。

### /packages/shared（新增）

- [`src/types/block.ts`](../packages/shared/src/types/block.ts) —— **改动**：块定义（`BlockDefinition`）、块实例（`BlockInstance{ id, key, enabled, data }`）、字段声明类型（`BlockFieldSchema`）、数据来源（`dataSource`）
- [`src/types/content.ts`](../packages/shared/src/types/content.ts) —— **改动**：`PageEntity` / `ChannelEntity` 增加 `path`、`kind`、`draft`、内容/发布指纹
- `src/types/geo.ts` —— 新增：`GeoDoc`（双模式）、发布前检查项与结果类型
- `src/types/editor.ts` —— 新增：内容树节点、草稿出入参、产物清单、块使用位置类型
- `src/constants/block-injection.ts` —— 新增：数据注入契约声明（编辑页面板与渲染引擎共用）
- `src/utils/template-vars.ts` —— 新增：变量占位符解析（`{{site.*}}` / `{{page.*}}` / `{{now:…}}`，仅构建期或请求期调用）

### /apps/server（新增模块与文件）

- `prisma/schema/site.prisma` —— **改动**：实体标识（工商全称/常用名/别名）、资质（登记号/许可证有效期/机构类型等级/法人/成立日期/诊疗科目）、NAP（地址/邮编/经纬度/对外电话）、门诊时间、医保、关联标识、主题令牌、GEO 配置（实体 JSON-LD / llms.txt / head 扩展 / robots meta）
- `prisma/schema/content.prisma` —— **改动**：`Channel.path`；`Page.path` / `kind` / `draft` / `contentHash` / `publishedHash` / `jsonLd` / `jsonLdMode` / `sort`
- `prisma/schema/block.prisma` —— 新增：`BlockDefinition` + `BlockDefinitionVersion`
- `prisma/schema/navigation.prisma` —— 新增：`Navigation` + `NavigationItem`（头部主导航 + 页脚四列）
- `prisma/schema/static-file.prisma` —— **改动**：图集字段（说明 / 位置 / 拍摄日期 / 图片编号）
- `prisma/schema/publish-task.prisma` —— **改动**：`scope` / `targets` / `buildId` / `artifact`
- `prisma/migrations/**` —— 新增：手工 SQL（字段与表、`path` 回填、旧 blocks 结构升级）
- `prisma/seed.ts` —— **改动**：新增菜单种子（内容编辑器 / 块库 / 导航管理）+ 内置块定义种子
- `src/modules/content/**` —— **改动**：内容树、草稿读写与放弃、目录与页面操作、地址锁定校验、路径工具（`path.util.ts`）
- `src/common/utils/geo-check.ts` —— **改动**：扩展为发布前检查清单（含医疗合规、实体唯一性、统计口径）；从 `modules/content/` 移到 `common/utils/`，并新增站点级 `checkSiteGeo`（由 `GET /geo/site-check` 接线）
- `src/modules/blocks/**` —— 新增：块定义读写、SFC 编译校验、字段声明抽取、版本回退、使用位置、渲染引擎代码清单接口
  - `blocks.service.ts` 的 `save` / `rollback` 共用 `archiveVersion`：两者都会**先归档被覆盖的那一版**，保证版本表始终覆盖 [上一版, 当前版]，回退不会跳过版本断层恢复出更旧内容
- `src/modules/geo/**` —— 新增：`POST /geo/preview`（GEO 文档纯计算预览）；`GET /geo/site-check?siteId=`（站点级 GEO 就绪度体检，判定基于最终产物文本而非配置是否填写）
- `src/modules/navigation/**` —— 新增：导航项 CRUD 与排序
- `src/modules/preview/**` —— 新增：预览票据签发、草稿读口、GEO 生成预览（纯计算）
- `src/modules/publish/**` —— **改动**：级联目标（单页发布校验 pageIds 均存在且属于本站）、队列、产物清单读口、回退上一版、站点下载（`download.service.ts`）
- `src/modules/bootstrap/**` —— 新增：建站描述导入（站点配置 + 目录 + 页面 + 块 + 导航 + 占位内容，幂等）
- `src/modules/public/**` —— **改动**：站点配置/路由/页面改用物化 `path`；新增列表页数据查询与渲染引擎内部接口

### /apps/geo（渲染引擎）

- `app/components/frame/{FrameTopBar,FrameSiteHeader,FrameBreadcrumb,FrameSiteFooter}.vue` —— 新增：框架块（门诊信息条 / 头部 / 面包屑 / 页脚），DOM 与类名对齐设计稿原型（09 §7.1 / §7.4.1）
- `app/components/blocks/Blk*.vue`（41 个）—— 新增：内容块组件（构建期由 `sync-blocks.mjs` 落盘，gitignore）。清单与硬约束见 09 §7.2
- `app/components/blocks/BlockRenderer.vue` —— **改动**：`import.meta.glob('./Blk*.vue')` 动态解析（`Blk` + Pascal(key)）、停用过滤、`data-block-id`、块缺失显式占位
- `app/components/PageRender.vue` —— **改动**：GEO 双模式注入、canonical、预览提示条
- `app/layouts/default.vue` —— **改动**：站点外壳改为框架块组合（`FrameTopBar` / `FrameSiteHeader` / `<main>` / `FrameSiteFooter`）
- `app/pages/**` —— 新增：静态页与详情页通配路由（`index.vue` / `[...slug].vue`）
- `app/composables/usePage.ts` —— **改动**：预览（草稿）与正式双数据源
- `app/composables/usePreview.ts` —— 新增：预览态判定与票据处理
- `app/utils/theme.ts` —— 新增：站点主题令牌 → CSS 变量（`DEFAULT_THEME_TOKENS` / `themeStyle` / `themeRootCss`）
- `app/utils/block-context.ts` —— 新增：块渲染上下文装配（09 §5 数据注入契约）
- `app/utils/head-extra.ts` —— 新增：站点级 head 扩展解析与净化
- `app/app.vue` —— **改动**：注入站点主题 CSS 变量 + 引入站点样式层（原型 CSS 与派生变量别名，09 §7.4.1）
- `app/middleware/site-prefix.global.ts` —— 新增：回环地址下统一补齐站点前缀（ADR-031）
- `public/assets/css/{theme-b,site}.css` —— 新增：设计稿原型样式**原样落地**（ADR-036）
- `public/assets/img/{cert,device,doctor,env}/**` —— 新增：设计稿图片资产 60 个（ADR-037）
- `server/middleware/preview.ts` —— 新增：预览票据校验、草稿渲染、禁索引、关埋点
- `server/routes/static/[...path].ts` —— 新增：`/static/**` 同源代理（Nitro 路由 → 服务端素材库 `useStaticAssets`，透传状态码 / content-type / 查询串，dev SSR 与渲染服务共用）
- `scripts/build-sites.mjs` —— **改动**：复制现有产物 → 增量生成 → 全量索引与主站索引 → 合并清单 → 清理下线页 → 保留上一版；2026-10-07 进一步改为「构建缓存判定（命中跳过 Vite）+ SSR 爬取 targets + 跨站点构建锁」（ADR-032）
- `scripts/sync-blocks.mjs` —— 新增：块代码落盘（数据库 → `app/components/blocks/Blk*.vue`，幂等跳过未变化块）
- `nuxt.config.ts` —— **改动**：组件自动导入 `pathPrefix: false`、`publicDir` 指向构建期产物目录、prerender 关闭（ADR-032）

### /apps/admin（管理后台）

- `app/pages/sites/[id]/editor.vue` —— 新增：站点内容编辑器工作台（工具条 + 左树 + 上画布下操作 + 状态栏）
- `app/pages/sites/[id]/blocks.vue` —— 新增：块库（公共块 / 本站私有块两组）+ 使用位置
- `app/pages/sites/[id]/blocks/[key].vue` —— 新增：块代码编辑页（代码编辑器 + 数据注入契约面板 + 回退上一版）
- `app/pages/sites/[id]/navigation.vue` —— 新增：导航管理（头部主导航、页脚四列）
- `app/pages/sites/index.vue` —— **改动**：操作列 预览 → 编辑 → 内容编辑 → 下载 → 删除
- `app/pages/content/**` —— **改动**：列表保留，编辑跳转新工作台（`[id].vue` 收敛为跳转壳）
- `app/components/editor/PageTree.vue` —— 新增：内容树（徽标 / 搜索 / 新建 / 重命名 / 删除 / 上下移）
- `app/components/editor/PreviewCanvas.vue` —— 新增：iframe 画布 + 单向块定位高亮
- `app/components/editor/BlockList.vue` —— 新增：块列表（排序 / 添加 / 删除 / 启停）
- `app/components/editor/BlockDataForm.vue` —— 新增：按块字段声明自动生成的数据表单
- `app/components/editor/PageMetaPanel.vue` —— 新增：页面元信息（已发布地址只读）
- `app/components/editor/PublishDialog.vue` —— 新增：待发布清单 + 影响面 + 检查清单 + 二次确认
- `app/components/blocks/CodeEditor.vue` —— 新增：代码编辑器（高亮 / 格式化 / 错误行号标红）
- `app/components/blocks/InjectionPanel.vue` —— 新增：数据注入契约面板（可复制示例）
- `app/config/api/{editor,blocks,navigation}.ts` —— 新增：接口出口（`~` 别名引用）

### 文档

- [`spec/09-site-editor.md`](./spec/09-site-editor.md) —— 新增：站点内容编辑器与块代码化完整规格（含完整建站）
- [`spec/08-adr.md`](./spec/08-adr.md) —— **改动**：新增 ADR-023 ~ ADR-035；2026-10-08 追加 ADR-036（设计稿样式原样落地）/ ADR-037（图片资产双轨）
- [`spec/03`](./spec/03-frontend-architecture.md) / [`04`](./spec/04-data-model.md) / [`05`](./spec/05-api-contract.md) / [`06`](./spec/06-publish-and-geo.md) / [`07`](./spec/07-deployment.md) —— **改动**：各追加对应小节并指针到 09
- [`spec/INDEX.md`](./spec/INDEX.md) —— **改动**：文档地图与维护契约登记 09
- [`REQUIREMENTS.md`](./REQUIREMENTS.md) —— **改动**：新增 §17 与演进记录，调整 §14 否决项

---

## 勘误与补齐（2026-10-08 · 设计稿 1:1 还原）

> 背景：首次完整建站只按「块清单」搭页面，未按 AGENTS.md §6 流程先读 `09` 全文，导致 ① 块组件自创类名（视觉与设计稿不符）② 设计稿 60 张图片未落地（整站无图）③ `09 §7.4` 的 `--bg` 值记错（`#F5F8FC`，实为 `#FFFFFF`）④ 本节此前的 `apps/geo` 章节描述了一批**从未实现**的文件落点。
> 本节记录修正后的真实落点；L2 侧同步见 09 §7.4 / §7.4.1 / §12.3 / §12.5、03 §3.2 / §3.3 / §5、08 ADR-036 / ADR-037。

### 已删除的错误描述（勿再参照）

- ~~`app/components/layout/{TopBar,SiteHeader,Breadcrumb,SiteFooter}.vue`~~ → 实际为 `app/components/frame/Frame*.vue`
- ~~`app/components/blocks/BlockHero.vue` / `BlockText.vue` / `BlockFaq.vue` / `BlockImageList.vue` / `BlockContact.vue`~~ → 5 个文件**已不存在**，由 41 个 `Blk*.vue` 取代
- ~~`app/assets/styles/theme-b.scss`~~ → `apps/geo/app/assets/` **整个目录不存在**；原型 CSS 改为 `public/assets/css/` 原样落地
- ~~`server/plugins/block-source.ts` + `.blocks/` 生成目录~~ → 不存在；块直接落盘 `app/components/blocks/Blk*.vue`，由 `scripts/sync-blocks.mjs` 完成
- ~~`app/utils/seo.ts` / `app/utils/geo-meta.ts`~~ → 实际为 `app/utils/theme.ts` / `block-context.ts` / `head-extra.ts`（GEO 元数据构建已并入 `apps/server/src/common/utils/geo-docs.ts` 与 `PageRender.vue`）
