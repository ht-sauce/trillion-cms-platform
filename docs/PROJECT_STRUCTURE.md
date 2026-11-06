# PROJECT_STRUCTURE.md · 全局结构与文件说明

> 本文件按目录分级说明**每个目录的职责与每个文件的用途**，是项目文档的唯一结构化出处。
> 维护规则（写入 AGENTS.md）：每次新增 / 删除 / 修改文件用途后，必须同步更新本文件对应条目。
>
> **链接约定**：每个文件都以相对路径链接到真实文件，**点击即可在编辑器中直接打开**（链接基点为本文件所在目录 `docs/`）。
> 目录本身不带链接（避免跳转歧义），以粗体或代码形式标注。

---

## /（仓库根目录）

Monorepo 工作区根，只放工程配置、全局配置与全局文档，不放业务代码。

- [`package.json`](../package.json) —— workspace 根：跨应用脚本，**只有 8 条**（ADR-044）：`dev` / `build` / `db` / `site` / `release` / `bundle` / `lint` / `format`——应用、环境、动作一律走参数，全部经根 `scripts/` 的启动器、分发脚本与上线器执行
- [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) —— 声明工作区范围 `apps/*`、`packages/*` 与依赖构建白名单
- [`pnpm-lock.yaml`](../pnpm-lock.yaml) —— 依赖锁定文件（自动生成）
- [`.npmrc`](../.npmrc) —— pnpm 行为配置（`strictDepBuilds=false`，放行 Prisma 引擎等依赖构建脚本）
- [`.prettierrc`](../.prettierrc) —— Prettier 格式化规则（semi=false、singleQuote、printWidth=120 等）
- [`.prettierignore`](../.prettierignore) —— 格式化忽略清单（产物、依赖、锁文件，以及 `docs/` 与 `env/`）
- [`.editorconfig`](../.editorconfig) —— 编辑器基础格式（UTF-8、LF、2 空格）
- [`.gitignore`](../.gitignore) —— Git 忽略（依赖、产物、`sites/` 产物、`uploads/`、`env/.env.production`、PM2 配置 `ecosystem.config.json`、部署包 `deploy/`、启动器 / 上线器写入的入口清单 `dev-endpoints.txt` / `release-endpoints.txt`）
- `deploy/`（**运行时生成，不入库**）—— `pnpm bundle` 产出的自包含部署包（ADR-042，约 792 MB）：`start.mjs` / `db.mjs` / `README.md` + `config/` + `env/.env.<环境>` + `apps/{server,admin,geo}` 产物与依赖，整体拷贝到服务器后 `node start.mjs daemon` 即可运行；模板来源 [`scripts/deploy-runtime/`](../scripts/deploy-runtime)
- [`nginx.conf.example`](../nginx.conf.example) —— **生产 nginx 落地配置（直装 · git 仓库形态）**：主域名薄块统一反代（ADR-045）——每个主域名一对 server 块（80 跳转 443 + 443 主块：`ssl_certificate` 证书路径、**gzip 压缩**、`/geocms/`→3000、`/geoserver/`→3001、`/static/` 直出、`/` 全量反代 GEO :3002 并透传 `Host`；站点分发由 GEO 按 Host 完成，nginx 不感知站点）；附 acme.sh 泛域名证书签发与续期示例；拷贝到 `/etc/nginx/sites-available/` 即用。通用参考（域名 + 80/443）见 [`docs/spec/10-launch-runbook.md`](./spec/10-launch-runbook.md) §7，部署包形态的模板另见 [`scripts/deploy-runtime/`](../scripts/deploy-runtime)
- [`README.md`](../README.md) —— 项目基础说明：数据库、两种启动方式、常用命令、关键约定
- [`AGENTS.md`](../AGENTS.md) —— AI 开发规范入口：术语、目录约定、先读后开发流程、禁止事项

## /config（全局配置层，与 apps/ 同级）

**全平台配置的唯一事实来源中的"结构化配置与派生逻辑"部分**：端口表、应用清单、环境文件解析、API 基址 / CORS / 数据库连接串派生。应用代码不再硬编码端口与数据库，统一由本目录派生后注入进程。

- [`index.mjs`](../config/index.mjs) —— 全局配置出口：`loadConfig()` 加载环境并派生端口/API/数据库/CORS/局域网地址，`buildAppEnv()` 组装某应用进程的环境变量（原样透传 `TRUSTED_PROXIES` / `DBIP_CITY_MMDB`，内部令牌显式值优先、缺省由 JWT 密钥派生，见 07 §3.3），`describeConfig()` 生成启动摘要（含局域网 IP 行），`describeEndpoints()` 生成各工程访问入口清单（服务端含健康检查入口、生产环境自动略去 Swagger，`options.lan=false` 时不出局域网段落），`detectLanHosts()` 探测本机 IPv4（与 Vite 一致：全量返回，不排序、不区分虚拟网卡）
- [`ports.mjs`](../config/ports.mjs) —— 端口表：默认端口（server 3001 / admin 3000 / geo 3002）、环境变量键名映射与端口合法性校验
- [`apps.mjs`](../config/apps.mjs) —— 应用清单：短名、包名、工程目录、标题、日志配色、开发/构建/生产启动脚本名（`devScript` / `buildScript` / `startScript`）与共享类型包名 `SHARED_PACKAGE`（启动器、执行器、上线器共用）
- [`env.mjs`](../config/env.mjs) —— 环境解析：`--env` 解析、`env/.env.<环境>` 读取、极简 .env 解析器、必填变量校验

## /env（全局环境变量，与 apps/ 同级）

**各环境的变量值**：数据库、密钥、站点识别等；与 `config/` 分工明确（值 vs 结构/派生）。三个应用不再自带 `.env`。

- [`.env.development`](../env/.env.development) —— 开发环境（本机 MySQL、默认端口），已入库，`pnpm dev` 开箱可用；本机 `DBIP_CITY_MMDB` 指向 `aiTest/dbip-city-lite-20261106/dbip-city-lite-2026-11.mmdb` 的绝对路径，换机器需重新配置，不改鉴权密钥
- [`.env.test`](../env/.env.test) —— 测试环境（端口 3100/3101/3102、独立测试库），与开发环境可同机并存
- [`.env.production`](../env/.env.production) —— 生产环境（**不入库**，见 `.gitignore`；上线前必须逐项确认密钥与地址）
- [`.env.example`](../env/.env.example) —— 环境变量模板与逐项说明（新环境 / 新机器从此复制）；含 `TRUSTED_PROXIES` 可信代理 CIDR 与 `DBIP_CITY_MMDB` 离线库路径说明，不提供自动代理信任或自动下载/交付数据文件（07 §3.3.1）

## /scripts（根级工程脚本）

本地启动与包脚本执行工具，依赖根 `config/`，零第三方依赖。

- [`dev.mjs`](../scripts/dev.mjs) —— **开发启动器**（`pnpm dev [应用...] [--env <环境>]`）：加载全局配置 → 结束占用端口的旧进程（逻辑在 `port-guard.mjs`）→ 并发启动工程（各应用 `devScript`，源码直跑）→ 日志加前缀 → **摘要后先打印并落盘一份入口清单**（按配置端口，避免等 Nuxt 首次编译期间终端没有任何地址信息）→ **各工程就绪（日志就绪标志 / 端口监听）且静默 5s 后再打印一份**（含后台登录页、Swagger 文档与局域网入口，按实际监听端口，端口回退时自动修正）；清单被后续日志顶出屏幕时**自动补打**（日志静默 3s 即补打 — 每来一行新日志重置计时；日志持续不停则每 15s 兜底一次；上限 30 次），落盘文件为仓库根 `dev-endpoints.txt`（不入库）→ Ctrl+C 回收全部子进程
- [`cli.mjs`](../scripts/cli.mjs) —— **根命令公共工具**：`build.mjs` / `db.mjs` / `site.mjs` 共用的 `--env` 剥离、按环境注入变量、pnpm / node 子进程执行封装（避免三个分发脚本各写一套）
- [`build.mjs`](../scripts/build.mjs) —— **构建器**（`pnpm build [目标...] [--env <环境>]`）：缺省全量（shared → server → admin → geo），目标可只给单端；共享类型包永远先行，失败即中止
- [`db.mjs`](../scripts/db.mjs) —— **数据库命令分发**（`pnpm db <动作> [--env <环境>]`）：`status` / `deploy` 转 [`db-release.mjs`](../scripts/db-release.mjs)，`migrate` / `push` / `generate` / `seed` / `backfill` / `studio` 转服务端包脚本；`migrate` 与 `push` 在非 development 环境**直接拒绝**（结构变更只能走 `deploy`）
- [`site.mjs`](../scripts/site.mjs) —— **站点命令分发**（`pnpm site <动作>`）：`build`（走 GEO `build:sites`，需 `--site`）/ `bootstrap` / `check` / `merge` / `assets` / `verify`，其余脚本参数原样透传
- [`exec.mjs`](../scripts/exec.mjs) —— **包脚本执行器**：以注入全局环境变量的方式执行某工程的 package.json 脚本（`site build`、`db.mjs` 之外的零散包脚本都走它）
- [`release.mjs`](../scripts/release.mjs) —— **代码上线器**（`pnpm release [应用...] [--env <环境>]`）：把平台**代码**发布到测试/生产环境，顺序固定为 **体检（密钥占位值 / 回环地址 / 产物齐备 / 数据库迁移只读检查）→ 构建（shared → 服务端 → 管理后台 → GEO 项目）→ 释放端口 → 生产模式启动（各应用 `start:prod`）→ HTTP 就绪探测（server `/geoserver/health`、admin `/geocms/`、geo `/`）+ `/geoserver/health` 运行时体检 → 打印入口并落盘 `release-endpoints.txt`**；**绝不执行迁移**，结构落后只拦下并提示先跑 `pnpm db deploy`（目标只有 admin/geo 时跳过该检查）；支持 `--check`（只体检）/ `--build-only`（体检 + 构建后停止，不启动进程，Linux 服务器手工交给 PM2）/ `--pm2`（体检 + 构建后自动「生成 PM2 配置 → `startOrReload` → `save`」）/ `--skip-build` / `--force`，任一步失败立即中止
- [`db-release.mjs`](../scripts/db-release.mjs) —— **数据库上线器**（`pnpm db deploy [--env <环境>]` / `pnpm db status [--env <环境>]`）：**唯一的改结构入口**，顺序固定为 **体检（环境文件 / 目标库 / 生产库口令为空或占位值即阻断，防改错库）→ 只读检查（`prisma migrate status`：已最新 / 待应用 / 库不存在 / 不可达）→ `prisma migrate deploy`（只应用未执行的迁移，幂等、非交互、空库自动建库）→ 复核**；`--check` 等价 `pnpm db status`（只读），`--force` 忽略阻断项；只做增量应用，永不 `db push` / reset
- [`pm2-config.mjs`](../scripts/pm2-config.mjs) —— **PM2 配置生成器**（ADR-041；常规路径由 `pnpm release --env <环境> --pm2` 内部调用，单独「只重生成配置」时用 `node scripts/pm2-config.mjs --env <环境>`，缺省 production）：以全局配置派生三端进程定义（进程名 `trillion-*`、`cwd` 对齐各应用包目录、`script` 与 `start:prod` 同口径、`env` 为 `buildAppEnv()` 结果、防崩溃风暴守护参数），写仓库根 `ecosystem.config.json`（PM2 原生 JSON，**含密钥：已 gitignore，禁止提交或跨机拷贝**）；产物缺失只警告不阻断；与上线器 `--pm2` / `--build-only` 配套（启动 / 重载 / 开机自启操作见 spec/10-launch-runbook.md）
- [`port-guard.mjs`](../scripts/port-guard.mjs) —— **端口守护**（启动器与上线器共用）：查询监听端口的进程（Windows `netstat` / POSIX `lsof`）、结束进程（`taskkill /T /F` / `kill`）、释放端口并等待可用（旧进程残留是「端口被占用」的常见根因）
- [`pack-deploy.mjs`](../scripts/pack-deploy.mjs) —— **部署包打包器**（ADR-042，`pnpm bundle` / `node scripts/pack-deploy.mjs --env <环境>`，缺省 production）：本地把三端产物 + 依赖 + 派生配置汇集为仓库根 `deploy/`（**免源码上线形态**，服务器只要有 Node 20+ / MySQL / nginx，无需 git / pnpm / PM2）。流程：**体检（三端产物 + shared dist 齐备）→ 拷 `config/` 与 `env/.env.<环境>`（含密钥）+ 运行时模板 → `pnpm deploy --node-linker=hoisted` 收集 server / geo（零 symlink，跨机拷贝不断链）并按白名单清理开发期文件 → 服务端包内补跑 `prisma generate`（机器产物随包提供）→ admin 拷 `.output` → 校验关键文件清单 → 输出大小 / 站点 / 拷贝提示**；产物 `deploy/` 与 `scripts/deploy-runtime/` 说明见下方条目，**含数据库口令与 JWT 密钥已 gitignore，禁止入库或跨机拷贝**
- [`deploy-runtime/`](../scripts/deploy-runtime) —— **部署包运行时模板**（随 `pnpm bundle` 拷入 `deploy/` 根，ADR-042）：`start.mjs`（进程入口：按 `config/apps.mjs` 清单 spawn 各应用、`daemon` 后台守护 + 崩溃自动重启（4s / 上限 10 次）/ `stop` / `status` / `restart`，日志落 `logs/`、pid 落 `.run/`）、`db.mjs`（数据库入口：`status` / `deploy` / `seed`，直接调包内 server 自带 prisma CLI 与 tsx，服务器无需 pnpm）、`README.md`（服务器侧操作说明）；nginx 参考配置收口在仓库根 `nginx.conf.example`。操作口径见 spec/10-launch-runbook.md §4.0
- [`pnpm.mjs`](../scripts/pnpm.mjs) —— pnpm 调用封装：跨平台定位 pnpm 可执行入口，避免 Windows 下 `.cmd` 必须走 shell 的参数拼接告警
- [`bootstrap-site.mjs`](../scripts/bootstrap-site.mjs) —— **建站描述导入 CLI**（09 §12.2，`pnpm site bootstrap`）：登录后台 → `POST /sites/bootstrap` 灌入整站描述 JSON（站点档案 + 目录树 + 页面与块 + 导航）；幂等，可重复执行
- [`merge-site-data.mjs`](../scripts/merge-site-data.mjs) —— **建站描述分片合并器**（`pnpm site merge`）：站点档案 `site-profile.json` + 页面分片 `pages-*.json` → 单份描述（缺省输出 `scripts/data/site.json`，可用 `--out` 指定）；顺带校验目录引用与导航引用可解析
- [`check-site-data.mjs`](../scripts/check-site-data.mjs) —— **建站描述契约校验器**（`pnpm site check <描述文件>`，**路径必填**）：以块 SFC 的 `defineBlock` 声明为唯一事实来源，递归比对每个块实例的键名与必填项（`--dump-fields` 只打印字段清单）
- [`upload-site-assets.mjs`](../scripts/upload-site-assets.mjs) —— **素材库双轨上传**（ADR-037 轨①）：把 `apps/geo/public/assets/img/**` 图片以 `siteId` 上传进 CMS 素材库（按 `originalName` 幂等判重，结尾做磁盘↔素材库集合对账）；站点页面引用的 `/assets/img/**` 是轨②静态直出，两轨文件名一一对应
- [`check-built-site.mjs`](../scripts/check-built-site.mjs) —— **站点产物机械检查**（09 §12.3 step7 补充 / §12.4）：对构建产物逐页校验唯一 h1 / title / description / canonical、JSON-LD 可解析、内链完整、图片可达、NAP 电话口径、标签闭合；只做机械校验，**不能替代 §12.5 人眼视觉比对**
- [`data/import-forintech-cases.mjs`](../scripts/data/import-forintech-cases.mjs) —— **工程案例采集脚本**（一次性，`node scripts/data/import-forintech-cases.mjs`）：抓 `https://sea.forintech.com/zh/casestudies` 列表页与详情页，解析标题 / 导语 / 正文 / 内容图，图片下载后按 `StaticFilesService` 规则落 `uploads/<yyyy>/<mm>/<uuid>.<ext>` 并登记 `StaticFile`（`source='富林泛泰官网 · 工程案例'`），按标题匹配更新存量 `CaseStudy`。**默认 dry-run**，`--apply` 才写库；`--audit-industry` 只读输出行业命中 / 未命中清单；`--normalize-industry` 把历史脏行业回填为分类表；`--show <关键词>` 打印该案例解析出的正文 HTML（调试版式）。**解析口径（ADR-060）**：正文区以「标题首次出现」为起点、页脚 / 原站翻页控件为终点，区间内按 `<img>` 切分并**产出保留排版的整篇 HTML**——按 `<br>` 拆行、字号 ≥20px 判小标题（h2）、行内保留加粗/颜色/字号；图片取 srcSet 里**最高分辨率原图**（小图不被站点放大）；「图 + 短说明」交替或「两图 + 两段短说明」时用 grid 两列容器还原 logo 并排；噪音清单覆盖翻页控件、`项目画廊`、`top of page`、导航菜单段、零宽字符；图片按原始文件名判重（重跑不重复下载）
- [`data/import-forintech-news.ts`](../scripts/data/import-forintech-news.ts) —— **富林泛泰中文新闻重采脚本**：通过媒体页真实滚动发现中文新闻，读取 `post-description` 正文区，按原顺序生成可视化编辑器支持的段落、图片、列表与行内 HTML，经 `sanitizeArticleHtml` 清洗后写入 `bodyHtml`，由 `htmlToText` 派生纯文本；图片下载并登记本站素材。**默认 dry-run，不写库**，`--first` 核对首篇、`--apply` 先备份再写库；存量按标题匹配并保留 ID/slug/发布日期，缺失文章补建新闻详情页；只更新本站新闻及 `/news` 派生页，不调用四域 rebuild，案例/其他站点新闻/非新闻页面/产品/问答用前后 SHA-256 对账。通过 `pnpm --filter @trillion/server exec tsx <脚本绝对路径> --browser-module <系统临时目录内的 playwright-core/index.mjs>` 执行，支持 `--env` 指定环境；抓取缓存、备份、图片中间文件和报告均放系统临时目录（`--work-dir` 可指定其子目录）。
- [`data/backfill-body-html.mjs`](../scripts/data/backfill-body-html.mjs) —— **正文块数组 → 整篇 HTML 一次性回填**（ADR-060）：把 `NewsArticle.body` / `CaseStudy.bodyBlocks` 的历史块数组按 `articleBlocksToHtml` 同口径转成 `bodyHtml`（段落/小标题保留行内 html、图片转 `figure`、表格/视频原样）；**默认 dry-run**，`--apply` 才写库；已转换的记录按 `bodyHtml IS NULL` 跳过，幂等可重跑
- [`data/case-industry-map.json`](../scripts/data/case-industry-map.json) —— **案例 → 行业分类映射表**：`{ 数据源标题: { industry: 分类名, match?: 库里存量标题 } }`；`industry` 必须是 `ProductIndustry.name`，`null` 表示暂不分类（需人工决定）；采集脚本缺映射会中止，不自动建分类

## /case-repair-evidence

- [`editor-verify-20261105/report.md`](../case-repair-evidence/editor-verify-20261105/report.md) —— 当前 dirty 正文保真实现的独立复核：真实 wangEditor 三类撤修复红/绿/反向红、33篇新闻只读往返、案例样本保存重开、26页定向构建、130图验收及异步发布副作用恢复；保留本轮独立备份与日志。
- [`publish-20261105/report.md`](../case-repair-evidence/publish-20261105/report.md) —— 本轮仅25案例及列表同步构建报告；同目录保留数据/产物备份、构建日志、25篇130图真实Edge本站截图、后台样本保存重开失败与副作用恢复证据、最终保护范围对账，不代表后台保存保真已修复。
- `publish-preflight-20261105.md` / `preflight-worktree-20261105.zip` —— 本次案例定向发布预检与已有代码变更备份；记录运行状态、16 项回归结果及发布规格冲突阻断，不替代逐篇发布后验收。
- [`report.md`](../case-repair-evidence/report.md) —— forintech 25 条案例重采交付报告：仅定向更新管理源正文/封面/来源，真实 Edge 原站截图与 wangEditor 全文、图片顺序、输入撤销验证，不发布；包含计数与原站加载限制。
- `backup.json` / `backup.sha256` / `after-cases.json` / `audit.json` —— 写入前备份、校验摘要、写入后案例及保护范围/素材对账；`<slug>.json` 保存逐篇图文顺序与编辑器验证结果。
- `<slug>-source.png` / `<slug>-editor*.png` —— 逐篇真实 Edge 原站整页截图、管理后台编辑器及逐图位置截图；断点与首篇/全量核验记录由 `completed.json` / `pilot-verified.json` / `editors-verified.json` 保存。临时采集脚本及认证状态仅在系统 Temp，不入仓库。

## /docs

项目文档目录。

- [`REQUIREMENTS.md`](./REQUIREMENTS.md) —— **需求规格（唯一事实来源）**：定位、架构决策、数据模型、GEO 清单、权限、监控、UI、部署、分期、否决专区
- [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) —— 本文件：全局目录与文件说明
- [`GLOSSARY.md`](./GLOSSARY.md) —— **术语表（专有名词统一解释口径）**：按「地址与域名 / 内容 / 块 / 发布与产物 / GEO / 工程」分组解释 slug、canonical、产物清单、内容指纹、公共模板等名词，并标注相关文档；后台界面上的问号提示文案来源是 `apps/admin/app/config/glossary.ts`
- **`spec/`（架构与技术规格层，编号体系）** —— 介于需求与文件说明之间，定义"系统怎么设计"。改动组件/数据表/接口/发布/部署前必须先改这里：

  | 文件                                                | 内容                                                    |
  | --------------------------------------------------- | ------------------------------------------------------- |
  | [`spec/INDEX.md`](./spec/INDEX.md)                  | 索引与阅读顺序、文档优先级、维护契约；本轮仅补 ADR 的限定阅读路径与决策/验收状态区分 |
  | [`spec/00-overview.md`](./spec/00-overview.md)      | 系统总纲：定位、术语、架构原则、质量属性、边界与约束    |
  | [`spec/01-system-context.md`](./spec/01-system-context.md) | C4 L1/L2：系统上下文、容器划分、通信矩阵、关键场景时序  |
  | [`spec/02-server-architecture.md`](./spec/02-server-architecture.md) | 服务端分层、模块职责、横切机制、站点隔离、已知约束 |
  | [`spec/03-frontend-architecture.md`](./spec/03-frontend-architecture.md) | 管理后台与 GEO 项目结构、请求链路、双模式取数、约束 |
  | [`spec/04-data-model.md`](./spec/04-data-model.md)  | 15 张表职责与关系、字段口径、隔离与索引、迁移与种子     |
  | [`spec/05-api-contract.md`](./spec/05-api-contract.md) | 接口分组、菜单鉴权矩阵、状态码、发布体检及入站监控/需求契约与未验收边界 |
  | [`spec/06-publish-and-geo.md`](./spec/06-publish-and-geo.md) | 发布流水线、原子替换、产物规范、GEO 四层落地    |
  | [`spec/07-deployment.md`](./spec/07-deployment.md)  | Docker/直装/部署包拓扑、端口、环境变量、持久化、健康检查；DB-IP/可信代理配置与有限验证、替库及部署边界 |
  | [`spec/08-adr.md`](./spec/08-adr.md)                | 架构决策记录（含否决项与副作用）；2026-11-06 新增 ADR-062 全平台菜单权限、ADR-063 轻量监控、ADR-064 需求收集，标注旧权限/监控决策替代范围并保留原正文；决策采纳不等于实现验收 |
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
- [`src/types/site.ts`](../packages/shared/src/types/site.ts) —— 站点实体（主域名 `domain` + 别名域名 `domains`）、主题令牌、静态文件类型
- [`src/types/content.ts`](../packages/shared/src/types/content.ts) —— 栏目 / 页面 / 模板定义与结构化 Block 数据类型
- [`src/types/api.ts`](../packages/shared/src/types/api.ts) —— 统一响应、分页、管理员、会员、埋点载荷类型；管理员契约不再包含 siteIds
- [`src/types/menu.ts`](../packages/shared/src/types/menu.ts) —— 后台菜单实体与菜单树节点类型（含状态枚举）
- [`src/types/role.ts`](../packages/shared/src/types/role.ts) —— 后台角色实体与状态枚举（`platform` / `builtin` 标记）
- [`src/types/block.ts`](../packages/shared/src/types/block.ts) —— Block 类型清单与中文元数据（管理后台表单使用）
- **`src/utils/`（跨端运行时工具，非纯类型）**：`placeholders.ts` / `block-code.ts` / **[`geo-url.ts`](../packages/shared/src/utils/geo-url.ts) —— 站点地址与站点前缀的唯一实现**（`LOOPBACK_HOSTS` / `hostnameOf` / `isLoopbackUrl` / `normalizeBaseUrl` / `siteUrlPrefix` / `buildSiteUrl`：回环基址带 `/{slug}`、域名基址不带），服务端预览票据、管理后台列表「预览」、GEO 回环判定共用一份（见 ADR-031）
- **`dist/`（构建产物）** —— 服务端 `tsconfig.paths` 指向此处，**构建服务端前必须先 `pnpm build shared`**

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
- [`schema/site.prisma`](../apps/server/prisma/schema/site.prisma) —— `Site` 站点表（企业元数据 + 网站信息 + SEO/GEO 默认值；原 `renderMode` 字段已随 ADR-046 删除）与 `SiteDomain` 站点别名域名表（主域名仍是 `Site.domain`，本表存别名，多域名映射见 ADR-022）
- [`schema/static-file.prisma`](../apps/server/prisma/schema/static-file.prisma) —— `StaticFile` 静态文件 URL 表（URL 与物理存储解耦）
- [`schema/admin-user.prisma`](../apps/server/prisma/schema/admin-user.prisma) —— 管理后台用户与角色；历史 siteIds 列保留但不再用于管理业务数据授权，未执行删字段
- [`schema/member.prisma`](../apps/server/prisma/schema/member.prisma) —— `Member` 站点会员（按 siteId 隔离）
- [`schema/content.prisma`](../apps/server/prisma/schema/content.prisma) —— `Channel` 栏目、`Page` 页面（模板 + Block）、`Template` 模板定义
- [`schema/entity.prisma`](../apps/server/prisma/schema/entity.prisma) —— `Entity` 品牌/产品实体（GEO 实体一致性）
- [`schema/track.prisma`](../apps/server/prisma/schema/track.prisma) —— `TrackEvent` 埋点事件、`AiCrawlEvent` AI 抓取事件
- [`schema/access-log.prisma`](../apps/server/prisma/schema/access-log.prisma) —— 实施草稿：GeoAccessEvent 单张请求事实表，站点可空、完整 IP/UA、地址、响应结果与 DB-IP 地域快照（含 geoStatus，历史默认 unknown）；字段与未完成关联见 04 §3.7，不代表已迁移
- [`schema/demand.prisma`](../apps/server/prisma/schema/demand.prisma) —— DemandSubmission 需求/四栏联系方式/单份跟进备注/幂等键/clientIp，以及平台共用 GeoIpBan；IP 直接来自需求请求，不关联请求日志推断身份
- [`schema/migrations/20261106130000_add_demand_client_ip/migration.sql`](../apps/server/prisma/schema/migrations/20261106130000_add_demand_client_ip/migration.sql) —— 增量添加需求 clientIp；旧记录暂置空串且随即移除列默认值，不猜测历史 IP；2026-11-06 核实 development 已应用，本轮未修改文件
- [`schema/migrations/20261106120000_add_geo_inbound_monitoring/migration.sql`](../apps/server/prisma/schema/migrations/20261106120000_add_geo_inbound_monitoring/migration.sql) —— 入站与需求表迁移；2026-11-06 核实 development 已应用，本轮未修改文件
- [`schema/migrations/20261106150000_add_geo_status/migration.sql`](../apps/server/prisma/schema/migrations/20261106150000_add_geo_status/migration.sql) —— 独立增量添加 geo_status(16)，非空默认 unknown；已部署 development，旧迁移校验和不变，验证范围见 04 §3.7
- [`schema/migrations/20261106160000_remove_legacy_overview_menu/migration.sql`](../apps/server/prisma/schema/migrations/20261106160000_remove_legacy_overview_menu/migration.sql) —— 事务内定向删除 path=/ 的旧总览菜单 1 条及其 RoleMenu 2 条；已部署 development，其余菜单/授权不变，不执行种子
- [`schema/migrations/20261106170000_split_geo_monitor_menu/migration.sql`](../apps/server/prisma/schema/migrations/20261106170000_split_geo_monitor_menu/migration.sql) —— GEO 监控拆为父目录、访问分析与访问记录；原记录 ID/路径/授权保留，不批量补授角色；本地 development 已应用，未操作测试/生产，验收账号单独显式配置目录与分析权限
- [`schema/news-faq.prisma`](../apps/server/prisma/schema/news-faq.prisma) —— `NewsArticle` 新闻文章表、`FaqItem` 问答条目表（**管理源**，见 04 §8；`pageId` 为发布产物 `Page` 弱引用，`[siteId, slug]` 唯一）
- [`schema/catalog.prisma`](../apps/server/prisma/schema/catalog.prisma) —— `ProductIndustry` 产品行业分组、`Product` 产品、`CaseStudy` 成功案例（**管理源**，见 04 §9；`Product.industries` 存分组名数组以便多分组归属、`series` 是第二种分类维度；详情字段一律 `Json?`——MySQL 的 JSON/TEXT 列不允许 DEFAULT；`[siteId, slug]` / `[siteId, name]` 唯一）
- [`schema/publish-task.prisma`](../apps/server/prisma/schema/publish-task.prisma) —— `PublishTask` 发布构建任务（队列与日志）
- [`schema/menu.prisma`](../apps/server/prisma/schema/menu.prisma) —— `Menu` 后台侧栏菜单（`parentId` 自关联，最多三级）
- [`schema/role.prisma`](../apps/server/prisma/schema/role.prisma) —— `Role` 后台角色（`platform` 平台级标记、`builtin` 内置保护）与 `RoleMenu` 角色-菜单授权关系
- [`schema/migrations/migration_lock.toml`](../apps/server/prisma/schema/migrations/migration_lock.toml) —— 迁移锁（Prisma 生成）
- [`schema/migrations/20261103164500_init_current_schema/migration.sql`](../apps/server/prisma/schema/migrations/20261102133000_init_current_schema/migration.sql) —— **唯一迁移（2026-11-03 重建基线）**：24 张表的完整 DDL、全部外键与主键（`prisma migrate diff --from-empty` 生成，无 `render_mode` 列——ADR-046）。上一版基线（ADR-043 的 `init_id_string`）与历史迁移一并废弃（见 04 §6；本地 Windows 的 migrate drift 误报说明亦见该节）
- [`maintenance/fix-prisma-migrations-meta-table.sql`](../apps/server/prisma/maintenance/fix-prisma-migrations-meta-table.sql) —— **一次性环境修复（不是迁移）**：旧版 Prisma CLI 建出的 `_prisma_migrations` 台账 `applied_steps_count` 无 DEFAULT，会让 `migrate deploy` 报「Field 'applied_steps_count' doesn't have a default value」而整体失败；本脚本为其补默认值，幂等，用 `prisma db execute --file` 执行（见 10-launch-runbook §4.2）
- [`maintenance/fix-table-name-case.sql`](../apps/server/prisma/maintenance/fix-table-name-case.sql) —— **一次性环境修复（不是迁移）**：Windows MySQL（`lower_case_table_names=1`）导库会把表名落到小写，Linux 默认区分大小写、Prisma 模型未写 `@@map`，于是报「The table `AdminUser` does not exist」；本脚本按映射把 21 张业务表改回大驼峰（`_prisma_migrations` 保持小写），幂等、仅改表名不动数据行、含外键自动改写与前后核对（见 10-launch-runbook §11）
- [`seed.ts`](../apps/server/prisma/seed.ts) —— 种子数据：内置角色、平台管理员、菜单、模板及内置块；事务先清除旧 path=/ 总览菜单与 RoleMenu，新增“站点管理 → 需求收集” `/sites/demands`。默认菜单只初始化新建内置角色，不补授既有角色（含零授权），本轮不执行种子
- **`blocks/*.vue`（54 个，块唯一真源）** —— 公共块模板代码（`defineBlock` 字段声明 + 原型类名 DOM，09 §7.4.1 / ADR-036）。改块必须改这里再 `pnpm db seed` → 站点副本重同步 → `geo blocks:sync`；直接改数据库或只改 GEO 侧 `Blk*.vue` 会在下次 seed / 构建时被覆盖或产生「块不可用」。`telbar`（尾部预约条）/`vcard-grid`（键值对卡片栅格）在仁爱建站时新增（09 §7.2.2）；`faq-board`（问答分类页签 + 关键词搜索 + 站内分页，ADR-055）在 forintech 问答改版时新增

### src/（源码）

- [`main.ts`](../apps/server/src/main.ts) —— 启动入口：设置中国时区、**全局前缀 `/geoserver`**（ADR-040）、全局管道/拦截器/异常过滤器、静态资源；公开需求在 Body 解析前按可信 IP 计数，畸形/超大 Body 统一 400/413 与 no-store/noindex；仅公开需求及预检动态放行有效站点 Origin，后台 CORS 保持配置白名单；Swagger（非生产，`/geoserver/docs`）及进程级异常兜底（ADR-032）
- [`app.module.ts`](../apps/server/src/app.module.ts) —— 根模块集中注册业务模块，包括 AccessModule/DemandsModule；注册不等于真实数据库链路验收通过

### src/config/（服务端配置映射，值的来源是根 env/ 与 config/）

- [`configuration.ts`](../apps/server/src/config/configuration.ts) —— 全局配置工厂（环境、端口、时区、数据库、JWT、上传、CORS、AI 清单、构建目录）；`TRUSTED_PROXIES` 映射为逗号拆分/去空白的 `trustedProxies`，`DBIP_CITY_MMDB` 映射为 `dbipCityMmdb`，缺省服务端相对路径 `data/dbip-city-lite.mmdb`
- [`env.validation.ts`](../apps/server/src/config/env.validation.ts) —— 环境变量 zod 校验（端口与数据库无应用内默认值，缺失启动即失败）；可信代理与 MMDB 路径为可选字符串，不代表已验证 CIDR、文件可读性或部署拓扑
- [`ai-crawlers.ts`](../apps/server/src/config/ai-crawlers.ts) —— AI 爬虫 UA 清单、UA 匹配、robots.txt 生成（UA 自动去重，并输出「AI 爬虫策略说明」注释段；`hasAiCrawlerPolicy` 供发布前检查判定）
- [`database-url.ts`](../apps/server/src/config/database-url.ts) —— 连接串拼装（密码特殊字符编码）

### src/common/（公共能力）

- [`constants.ts`](../apps/server/src/common/constants.ts) —— **分页通用常量**：默认每页 20、档位 `[10, 20, 30, 50, 100]`，以及入参收敛函数 `normalizePage` / `normalizePageSize`（与前端 `config/pagination.ts` 对齐）
- [`types/api-result.ts`](../apps/server/src/common/types/api-result.ts) —— 统一响应结构类型与 `ok()` 助手
- [`interceptors/transform.interceptor.ts`](../apps/server/src/common/interceptors/transform.interceptor.ts) —— 成功响应统一包装 `{ code:0, message:'ok', data }`
- [`filters/http-exception.filter.ts`](../apps/server/src/common/filters/http-exception.filter.ts) —— 全局异常过滤器（统一结构 + 5xx 日志）
- [`decorators/current-user.decorator.ts`](../apps/server/src/common/decorators/current-user.decorator.ts) —— `@CurrentUser()` 取登录用户
- [`guards/admin-auth.guard.ts`](../apps/server/src/common/guards/admin-auth.guard.ts) —— JWT-A 鉴权守卫（管理后台）
- [`decorators/require-menu.decorator.ts`](../apps/server/src/common/decorators/require-menu.decorator.ts) —— 全平台接口菜单声明：单菜单、共享入口任一菜单、共同操作全部菜单、块归属动态菜单
- [`guards/menu-permission.guard.ts`](../apps/server/src/common/guards/menu-permission.guard.ts) —— 全平台管理路由启用菜单与 RoleMenu 校验；未声明拒绝，无 platform 绕过；块写口按实际 scope/siteId 区分模板与本站菜单
- [`utils/ip.ts`](../apps/server/src/common/utils/ip.ts) —— IPv4/IPv6 归一化（含十六进制及展开形式的 IPv4-mapped IPv6）、CIDR 与可信代理客户端 IP 解析；实际代理配置/拓扑仍待核对
- [`guards/platform-admin.guard.ts`](../apps/server/src/common/guards/platform-admin.guard.ts) —— 历史守卫文件，管理业务控制器已全部脱离，不再作为授权边界
- [`common.module.ts`](../apps/server/src/common/common.module.ts) —— **全局公共模块**：注册并导出 JwtModule，让各业务模块直接使用守卫而无需各自注册 JWT
- [`workers/sfc-compile.ts`](../apps/server/src/common/workers/sfc-compile.ts) —— **SFC 编译主线程入口**：把块编译丢进 worker 线程（15s 超时），超时/崩溃归一为 400 错误不回退主线程；worker 产物缺失时降级主线程并告警（ADR-032）
- [`workers/sfc.worker.ts`](../apps/server/src/common/workers/sfc.worker.ts) —— **SFC 编译 Worker**（独立线程）：一次性执行 `validateBlockSfc` 后回传结果，避免 CPU 编译阻塞 NestJS 主事件循环
- [`utils/geo-check.ts`](../apps/server/src/common/utils/geo-check.ts) —— **发布前 GEO 体检纯函数**：页面级 `checkPageGeo`（标题/摘要/编审/案例禁用字段/canonical/NAP）与站点级 `checkSiteGeo`（实体声明 / llms / robots AI 策略 / robots meta / sitemap 核心 URL / NAP）。纯函数、被 content 与 geo 两个模块共用，故放在 `common/utils`
- [`utils/site-scope.ts`](../apps/server/src/common/utils/site-scope.ts) —— 仅保留显式 id/siteId 主动筛选，缺省不过滤；assertSiteAccess 为旧调用兼容空入口，不读取用户 siteIds/platform；业务归属检查仍由业务服务承担
- [`utils/json.ts`](../apps/server/src/common/utils/json.ts) —— Prisma JSON 字段读写收窄（`toJsonInput` / `fromJson`）
- [`utils/article-body.ts`](../apps/server/src/common/utils/article-body.ts) —— **正文结构化块（历史兼容格式，ADR-053）**：`ArticleBlock`（paragraph / heading / image / table / video / rich）+ `normalizeArticleBody` 白名单收口（类型、空块、图片地址只认 `/static`、`/assets`、`http(s)`、块数上限）+ `articleBlocksToText` 纯文本派生 + `resolveArticleBlocks`（有 body 用 body，否则按段落回落）。**ADR-060 起降级为历史兼容格式**（新代码写 `bodyHtml`），仍用于旧数据回落与迁移
- [`utils/article-html.ts`](../apps/server/src/common/utils/article-html.ts) —— **正文整篇 HTML 白名单化（ADR-060；ADR-061 起仅采集 / 导入脚本使用，后台保存不再调用）**：`sanitizeArticleHtml` 手写 tokenizer 做标签 / 属性 / 样式三层收口；`h1` 降为 `h2`、`h5/h6` 降为 `h4`，script/style 整块及注释丢弃，事件属性与浮层样式剔除，标签栈补齐结构。**幂等保存**：正文保留已有实体、裸字符仍转义；属性实体先解码再校验、重新转义，查询参数与引号不累积转义，实体编码的危险协议仍拒绝。**编辑器兼容白名单**：限定标签与取值的 wangEditor 图片 / 视频 / 表格标记；视频 `src/poster/controls/width/height`、`source` 的安全地址与视频 MIME、表格布局及单元格合并 / 尺寸属性；不放行任意 `data-*`，尺寸与数值属性逐项校验。媒体地址只认 `/static/`、`/assets/` 与 `http(s)`，链接另允许站内路径和锚点；排版样式含安全字号、字重、颜色与布局值。另提供 `htmlToText`（块级换行、去标签派生纯文本）与 `articleBlocksToHtml`（历史块数组 → HTML，纯文本单独转义，迁移用）
- [`utils/article-html.test.ts`](../apps/server/src/common/utils/article-html.test.ts) —— **正文 HTML 清洗工具回归测试（工具仅采集 / 导入使用，ADR-061）**（`node:test` + `node:assert/strict`）：覆盖连续清洗幂等、正文 / 属性实体与查询参数不重复转义、图片 / 视频包装与 `source` / 尺寸、表格布局与合并单元格保留；验证事件及任意 data 属性、危险尺寸 / MIME / 实体编码协议 / 属性引号注入仍受限，H1 降级与脚本 / 样式清洗不退化，历史块纯文本不被解释成 HTML
- [`utils/datetime.ts`](../apps/server/src/common/utils/datetime.ts) —— 中国时区时间格式化（输出 `YYYY-MM-DD HH:mm:ss`）
- [`utils/jwt-expiry.ts`](../apps/server/src/common/utils/jwt-expiry.ts) —— JWT 有效期类型收窄（兼容 jsonwebtoken 的 `StringValue`）

### src/prisma/

- [`prisma.module.ts`](../apps/server/src/prisma/prisma.module.ts) —— 全局 Prisma 模块
- [`prisma.service.ts`](../apps/server/src/prisma/prisma.service.ts) —— PrismaClient 生命周期管理

### src/modules/auth（管理后台登录 JWT-A）

- [`auth.module.ts`](../apps/server/src/modules/auth/auth.module.ts) —— 模块定义（JwtService 由全局 CommonModule 提供，此处不重复注册）
- [`auth.service.ts`](../apps/server/src/modules/auth/auth.service.ts) —— 登录校验（bcrypt）、JWT 签发、用户信息；JWT/视图不再下发 siteIds 数据授权
- [`auth.controller.ts`](../apps/server/src/modules/auth/auth.controller.ts) —— `POST /auth/login`、`GET /auth/me`

### src/modules/sites（站点管理）

- [`sites.module.ts`](../apps/server/src/modules/sites/sites.module.ts) —— 模块定义
- [`sites.controller.ts`](../apps/server/src/modules/sites/sites.controller.ts) —— 站点读写与导入按 `/sites` 菜单；列表共享给功能页站点选择，不扩大站点写权限
- [`sites.service.ts`](../apps/server/src/modules/sites/sites.service.ts) —— 站点 CRUD、**别名域名规范化与全局唯一校验**（随站点全量同步）、文件引用解析、JSON 字段与时间格式化、**列表/详情附加 `build`（最新构建任务摘要，批量取避免 N+1）**
- [`dto.ts`](../apps/server/src/modules/sites/dto.ts) —— 入参校验 DTO（QuerySiteDto / CreateSiteDto / UpdateSiteDto）
- [`constants.ts`](../apps/server/src/modules/sites/constants.ts) —— 站点默认值（AI 策略放行、主题令牌）

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
- [`news-faq.controller.ts`](../apps/server/src/modules/news-faq/news-faq.controller.ts) —— 新闻 `/sites/news`、问答 `/sites/faqs` 菜单授权；共同重建要求二者；详情直读表、不接收 siteId 参数，不做后台站点数据授权
- [`news-faq.service.ts`](../apps/server/src/modules/news-faq/news-faq.service.ts) —— 管理面 CRUD（**表驱动**：`NewsArticle` / `FaqItem` 为管理源）：列表/详情直读表 → 写表 → 委托同步服务创建或补建 kind=detail 发布产物页（保存即发布、slug 自动生成；**slug 创建后不可改**）、按 `pageId` 弱关联挂接失联产物 → 重算派生块 → 自动触发**页面级**发布（响应携带 `affectedPages` 与 `publishTaskId`）
- [`news-faq-sync.service.ts`](../apps/server/src/modules/news-faq/news-faq-sync.service.ts) —— **派生块同步（核心）**：`loadDetailTemplate(siteId, section)` 取该栏目最早创建的 detail 页登记为模板，`buildArticleDetailBlocks` / `buildFaqDetailBlocks` 在模板上只做字段覆盖（h1 / lead / chips / 正文段落），块顺序与固定文案全沿用模板；详情数据装载 `loadNewsDetails` / `loadFaqDetails` **直读管理表**（表是唯一事实来源）；`/news` 列表（post-list 按发布日期倒序、hero chips 置空、移除独立 pager）、`/faq` 列表（hero chips + 分类 `faq-list` 只填上架问答 + `faq-board` 填全量问答，ADR-055）、同分类详情页 related-faq 重算；Prisma 事务写回并重算内容指纹（块实例 id 同 key 顺序复用，常规编辑下指纹稳定）
- ~~`news-faq.constants.ts`~~ —— **2026-11-03 已删除**：原文件把仁爱医院站的门诊时间 / 029 电话 / 医学合规声明硬编码在此，换站点即错。现在详情页与列表页的块结构、固定文案一律从站点既有同栏目 detail 页克隆（ADR-052），代码内不含任何站点文案
- [`dto.ts`](../apps/server/src/modules/news-faq/dto.ts) —— 文章 / 问答入参 DTO（含 `YYYY-MM-DD` 格式与「不早于今天」校验、slug 格式校验；编辑 DTO 不收 slug）

### src/modules/catalog（产品体系 / 成功案例管理）

- [`catalog.module.ts`](../apps/server/src/modules/catalog/catalog.module.ts) —— 模块定义（依赖 Content / Publish 模块）
- [`catalog.controller.ts`](../apps/server/src/modules/catalog/catalog.controller.ts) —— `/catalog/*` 接口 14 条：行业分组 4 条、产品 5 条、案例 5 条（列表 / 单条详情 / 增删改）
- [`products.service.ts`](../apps/server/src/modules/catalog/products.service.ts) —— 行业分组 CRUD（**改名时事务内同步改写产品的 `industries` 引用**；有产品引用时删除 400）+ 产品 CRUD + `deriveDetailPage`（**保存即自动建页**，有 `pageId` 走页面更新、无则补建并回写）+ `syncAndPublish`（重算 `/products` 分组 + 只发布 `status='published'` 的页面）
- [`cases.service.ts`](../apps/server/src/modules/catalog/cases.service.ts) —— 案例 CRUD + `deriveDetailPage` + `syncAndPublish`（只重写 `/cases` 的 `case-grid.items`）
- [`catalog-sync.service.ts`](../apps/server/src/modules/catalog/catalog-sync.service.ts) —— **派生块同步**：`loadDetailTemplate` 取栏目模板；`buildProductBlocks` 维持产品字段覆盖；`buildCaseBlocks` 首屏仅用当前记录字段（头部大图未填时**复用卡片图片**，不继承模板或旧页头图、标签等内容），行业空不继承信息卡徽标，历史正文回落时清空模板 HTML；历史 `images` 保留兼容但不派生独立画廊，也不补画廊骨架；`overrides[key] = null` 跳过空信息卡、空正文、画廊及其前的 `section-head`；`syncProductsList` 重建分组块（定位 product-card 及其紧邻 section-head，前后缀块原样保留，无产品的分组不输出）；`syncCasesList` 只更新 `case-grid.items`
- [`catalog-sync.service.test.ts`](../apps/server/src/modules/catalog/catalog-sync.service.test.ts) —— 案例派生与弹窗回归：空字段不继承、历史画廊不输出且数据不变、空分区与标题隐藏、正文图片顺序与历史正文兼容、精简模板补信息卡与 ID 稳定、弹窗不编辑或提交 `images`；同时保护产品与新闻原有行为。运行：在 `apps/server` 执行 `pnpm exec ts-node --transpile-only src/modules/catalog/catalog-sync.service.test.ts`
- [`dto.ts`](../apps/server/src/modules/catalog/dto.ts) —— 入参 DTO（复用 `news-faq/dto` 的 `SLUG_PATTERN`）

### src/common/utils（跨模块公共工具）

- [`block-instances.ts`](../apps/server/src/common/utils/block-instances.ts) —— 块实例工具：`generateInstanceId`、**`withStableIds(next, oldBlocks)`（同 key 按出现顺序复用旧 id，保证常规编辑下 `contentHash` 稳定）**、`blockData`、`assembleFromTemplate`（按模板拼装 + 覆盖，`overrides[key] === null` 时跳过该块与其分组头）

### src/modules/blocks（块定义 / 块库 · 块隔离见 ADR-035）

- [`constants.ts`](../apps/server/src/modules/blocks/constants.ts) —— `PUBLIC_BLOCK_SITE_ID = 0`：**公共模板（模板库）**的 siteId 约定值（不用 NULL，唯一索引不约束多个 NULL）
- [`block-copy.ts`](../apps/server/src/modules/blocks/block-copy.ts) —— **块副本唯一实现** `copyTemplatesToSite(db, siteId, keys)`（幂等）：把公共模板复制为站点自有块（`scope=site`、`version=1` + 版本留档）；被保存草稿 / 建站导入 / 发布兜底 / 手动引入 / 回填与种子共用
- [`blocks.service.ts`](../apps/server/src/modules/blocks/blocks.service.ts) —— 列表（本站块 + 公共模板）/ 详情（`template=1` 只读模板）/ 新建 / 保存（站点维度**先复制副本再落笔**）/ 使用位置 / 回退上一版（`save` 与 `rollback` 共用 `archiveVersion`，先归档被覆盖的那一版）/ `apply`（模板引入本站）/ 渲染引擎清单与代码指纹（本站块优先 + 模板兜底）；保留模板副本边界，不按平台角色拒绝
- [`blocks.controller.ts`](../apps/server/src/modules/blocks/blocks.controller.ts) —— 上述接口（含 `POST /blocks/:key/apply`）；本站/模板写口分别按 `/blocks`、`/blocks/templates`，详情共享给内容编辑器，不按平台角色拒绝
- [`blocks-internal.controller.ts`](../apps/server/src/modules/blocks/blocks-internal.controller.ts) —— 渲染引擎内部清单接口（`GET /internal/blocks`，内部 token）
- [`sfc.ts`](../apps/server/src/modules/blocks/sfc.ts) / [`dto.ts`](../apps/server/src/modules/blocks/dto.ts) —— SFC 编译校验与入参 DTO

### src/modules/members（站点会员，管理侧）

- [`members.module.ts`](../apps/server/src/modules/members/members.module.ts) / [`members.controller.ts`](../apps/server/src/modules/members/members.controller.ts) / [`members.service.ts`](../apps/server/src/modules/members/members.service.ts) —— 会员列表、新建、删除按 `/members` 菜单；保留会员 siteId 归属与主动筛选，不按管理用户站点授权过滤

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

### src/modules/access（轻量入站监控，当前实施中）

- [`access.module.ts`](../apps/server/src/modules/access/access.module.ts) —— 访问记录与地域解析服务注册，已接入 AppModule；注册不代表真实数据库与完整采集链路验收
- [`access.controller.ts`](../apps/server/src/modules/access/access.controller.ts) —— 内部保存、`/monitor` 菜单授权分页与 `/monitor/analysis` 独立授权 summary；契约见 05 §7.1
- [`access.service.ts`](../apps/server/src/modules/access/access.service.ts) —— 单条写入、Host 站点解析、必要筛选分页与数据库侧有界 summary 聚合；默认中国时区七个自然日、最长连续90自然日，趋势补零、榜单Top10、状态/来源/地域快照，失败不伪装零流量；聚合日期使用保留毫秒的 UTC 字符串参数绑定，避免全局 Date.toJSON 覆盖影响 Prisma 原始查询；查询不重算历史地域
- [`geo-ip.service.ts`](../apps/server/src/modules/access/geo-ip.service.ts) —— 保存时 maxmind 读取 DB-IP City Lite MMDB；名称类型兼容 Names，区分非法/非公网/未命中/不可用/异常/命中，保留已加载库版本；本机真实读取已有 6 个公网及 5 个控制样本证据，非数据库联调验收；reader/加载 Promise 按进程缓存，替库需重启并复核，不支持自动热替库（07 §3.3.1）
- [`dto.ts`](../apps/server/src/modules/access/dto.ts) —— 请求快照、分页与去除分页的 summary 筛选 DTO；summary 成对校验时间，非法/倒置/超长范围400；状态码十进制整数转换，原分页非法日期口径不顺带改变

### src/modules/demands（需求收集，当前实施中）

- [`demands.module.ts`](../apps/server/src/modules/demands/demands.module.ts) —— 需求/验证码/计数服务注册，已接入 AppModule
- [`demands.controller.ts`](../apps/server/src/modules/demands/demands.controller.ts) —— 公开 captcha/submit/widget-config；完整 Origin 与 Referer 协议/主机/端口一致性、可信代理来源解析及内部 WeakSet 防重复计数；后台跟进/封禁契约保持，管理接口要求 `/sites/demands` 菜单授权
- [`demands.service.ts`](../apps/server/src/modules/demands/demands.service.ts) —— 解析前入口计数与服务直调计数共用 IP 互斥，后续复核封禁但不重复计数；有效域名映射站点，幂等回读先于挑战、成功保存后消耗；列表/详情/跟进附 siteName、clientIp 与 ban，不加数据权限
- [`captcha.service.ts`](../apps/server/src/modules/demands/captcha.service.ts) —— 安全随机图片挑战绑定归一化可信 IP，verify/consume 均核对 IP；跨 IP 不消耗、不计猜错，5 分钟/单挑战 5 次错误，不发访客会话 token
- [`rate-limit.service.ts`](../apps/server/src/modules/demands/rate-limit.service.ts) —— 进程内滚动窗口计数与 IP/验证码键互斥，保障单进程并发及人工封禁/解除顺序；不宣称多进程共享计数
- [`demands.constants.ts`](../apps/server/src/modules/demands/demands.constants.ts) —— 验证码期限及已确认限流/自动封禁初始参数，业务口径见 REQUIREMENTS §7.4
- [`dto.ts`](../apps/server/src/modules/demands/dto.ts) —— 需求/联系方式、跟进与 IP 封禁 DTO 草稿，当前长度值与待定验证口径见 05 §7.2
- [`demands.service.test.ts`](../apps/server/src/modules/demands/demands.service.test.ts) —— node:test 回归：幂等/并发/数据库失败/来源/限流/人工优先及本地 Nest HTTP 契约、菜单鉴权、widget/提交/详情/跟进；Prisma 替身不代表真实数据库验收

### src/modules/entities（实体一致性）

- [`entities.module.ts`](../apps/server/src/modules/entities/entities.module.ts) / [`entities.controller.ts`](../apps/server/src/modules/entities/entities.controller.ts) / [`entities.service.ts`](../apps/server/src/modules/entities/entities.service.ts) —— 品牌/产品实体与别名维护

### src/modules/menus（后台菜单）

- [`menus.module.ts`](../apps/server/src/modules/menus/menus.module.ts) —— 模块定义
- [`menus.controller.ts`](../apps/server/src/modules/menus/menus.controller.ts) —— 树仅登录并按角色过滤；维护按 `/settings/menus` 菜单，配置读口共享给角色授权树
- [`menus.service.ts`](../apps/server/src/modules/menus/menus.service.ts) —— 菜单树构建、层级与环路校验（最多三级）、存在子菜单时拒绝删除
- [`dto.ts`](../apps/server/src/modules/menus/dto.ts) —— 菜单入参校验 DTO

### src/modules/roles（后台角色）

- [`roles.module.ts`](../apps/server/src/modules/roles/roles.module.ts) —— 模块定义
- [`roles.controller.ts`](../apps/server/src/modules/roles/roles.controller.ts) —— 维护按 `/settings/roles` 菜单；角色列表共享给 `/settings/users` 的绑定选择
- [`roles.service.ts`](../apps/server/src/modules/roles/roles.service.ts) —— 角色 CRUD、菜单授权保存（自动补全上级菜单）、内置角色与用户绑定的删除护栏
- [`dto.ts`](../apps/server/src/modules/roles/dto.ts) —— 角色入参校验 DTO

### src/modules/admin-users（后台用户）

- [`admin-users.module.ts`](../apps/server/src/modules/admin-users/admin-users.module.ts) —— 模块定义
- [`admin-users.controller.ts`](../apps/server/src/modules/admin-users/admin-users.controller.ts) —— 用户 CRUD 与角色绑定按 `/settings/users` 菜单，不再按 platform 拒绝
- [`admin-users.service.ts`](../apps/server/src/modules/admin-users/admin-users.service.ts) —— 用户 CRUD、bcrypt、角色绑定；不读写/下发 siteIds，保留不能删自己与至少一个可用平台级用户的删除/降级/停用护栏
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

公共筛选栏布局由 `main.scss` 的 `.filter-bar` / `.filter-actions` 提供：输入靠左，操作整组靠右，空间不足整体换行仍右对齐，8px gap 与按钮默认外边距重置统一维护。

### app/config（配置化内容统一在此）

- [`api/http.ts`](../apps/admin/app/config/api/http.ts) —— **请求唯一出口**：baseURL（缺失即报错、指向回环地址时按浏览器主机名自适应以便同局域网访问）、token 注入、401 跳转（`currentRoutePath()` 剥 `/geocms` 前缀后判定，避免基础路径误判）、错误提示、get/post/patch/del/upload；两个地址解析函数——`resolveFileUrl`（`/static/` 素材库 → 服务端 origin）与 `resolveMediaUrl`（`/assets/...` 站点产物图片 → 站点基址 `NUXT_PUBLIC_SITE_BASE`，两类路径语义不同不可混用）
- [`api/auth.ts`](../apps/admin/app/config/api/auth.ts) —— 登录、当前用户接口
- [`api/sites.ts`](../apps/admin/app/config/api/sites.ts) —— 站点相关接口（`SiteItem.build` = 最新构建任务摘要，站点列表「构建状态」列的数据来源）
- [`api/files.ts`](../apps/admin/app/config/api/files.ts) —— 静态文件上传/列表/删除/替换（`replace` → `PUT /files/:id/replace`，URL 不变仅换文件）接口
- [`api/content.ts`](../apps/admin/app/config/api/content.ts) —— 栏目与页面接口
- [`api/members.ts`](../apps/admin/app/config/api/members.ts) —— 站点会员接口
- [`api/access.ts`](../apps/admin/app/config/api/access.ts) —— 入站分页与只读 summary API，剔除聚合请求分页字段；精确声明 totals/四类趋势/状态/榜单/来源/地域与geoStatus类型及状态字典
- [`api/demands.ts`](../apps/admin/app/config/api/demands.ts) —— 需求列表/详情/跟进与 IP 禁用/解禁封装；路径、UUID 寻址及 clientIp/ban 字段已与服务端静态对齐（05 §7.2），真实数据库与浏览器交互联调仍待验收
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
- [`api/catalog.ts`](../apps/admin/app/config/api/catalog.ts) —— 产品体系 / 成功案例接口（**表驱动 id 寻址**：读 `ProductIndustry` / `Product` / `CaseStudy`；列表不返回详情字段，编辑回显走 `productDetail` / `caseDetail`；分组删除前由前端校验 `productCount`；保存后服务端自动派生详情页并页面级发布）
- [`api/index.ts`](../apps/admin/app/config/api/index.ts) —— API 统一出口
- [`menu.ts`](../apps/admin/app/config/menu.ts) —— 站点状态等字典映射（含 **`BUILD_STATUS_META`：构建状态唯一口径**——未构建 / 排队中 / 构建中 / 构建成功 / 构建失败，站点列表、内容编辑器、总览发布任务三处共用；原 `RENDER_MODE_LABEL` 已随 ADR-046 删除）；**侧栏菜单与角色名均已改为后台数据驱动，不在此硬编码**；状态色只给 `.c-*` 语义类名）
- [`site-defaults.ts`](../apps/admin/app/config/site-defaults.ts) —— 站点主题默认值（与服务端 `SITE_DEFAULTS.theme` 对齐；唯一允许写颜色字面量的 TS 文件）
- [`pagination.ts`](../apps/admin/app/config/pagination.ts) —— **分页统一配置**：默认每页 20、档位 `[10, 20, 30, 50, 100]`、`el-pagination` 统一 layout（与服务端 `common/constants.ts` 对齐）
- [`glossary.ts`](../apps/admin/app/config/glossary.ts) —— **专有名词字典（界面文案唯一事实来源，58 条）**：`TERMS.<key>` = `{ label, hint }`，按「地址与域名 / 内容 / 平台与 GEO / 块 / 导航 / 监控与运行 / 权限」分组（slug / canonical / 产物清单 / 内容指纹 / 块标识 / 公共模板 / PV / 站点授权 …）；页面禁止硬编码名词与解释，配合 `components/TermHint.vue` 出问号说明；文档侧同口径解释见 [`GLOSSARY.md`](./GLOSSARY.md)

### app/utils

- [`menu-tree.ts`](../apps/admin/app/utils/menu-tree.ts) —— 菜单树工具：平铺列表 ↔ 多级树；首页按授权树顺序选择首个可点击叶子路径，跳过 / 与非内部路径
- [`tool.ts`](../apps/admin/app/utils/tool.ts) —— 交互工具（**防抖与 loading 相互独立**）：`debounce` / `throttle`（时间维度，默认 `leading` 即先触发后防抖）与 `useLoading()`（状态维度：`run` 整块互斥 / `runKeyed` 行级互斥 / `isLoading` 行内 loading）；全部写操作按钮统一从这里引入，组合顺序为「防抖在外、loading 在内」

### app/plugins

- [`element-plus.ts`](../apps/admin/app/plugins/element-plus.ts) —— 注册 Element Plus（中文语言包）
- Pinia **不在此处注册**：由 `nuxt.config.ts` 的 `@pinia/nuxt` 模块接入（自动创建实例 + 自动导入 `app/stores/**`，禁止再手写 `createPinia` 插件）

### app/stores

- [`auth.ts`](../apps/admin/app/stores/auth.ts) —— 登录状态：token 持久化（localStorage）、用户信息（含 `roleName` / `platform`）；由 `@pinia/nuxt` 自动导入
- [`menu.ts`](../apps/admin/app/stores/menu.ts) —— 菜单树状态：登录后拉取 `/geoserver/menus/tree`（按当前用户角色授权过滤）并缓存，提供面包屑标题查询与退出时重置

### app/components（弹窗一律独立组件，规范见 AGENTS.md §7）

- [`NewsBodyEditor.test.ts`](../apps/admin/app/components/NewsBodyEditor.test.ts) —— 安装版 Edge 中加载真实 wangEditor 与组件解析/序列化逻辑；验证尺寸、对齐、间距、撤销重开和媒体URL边界，`BODY_EDITOR_REVERSE=dimensions|styles|urls` 仅对内存源码撤修复作反向红，不覆盖 dirty 文件；浏览器依赖通过 `BROWSER_TEST_MODULE` 指定。
- [`SideMenuNode.vue`](../apps/admin/app/components/SideMenuNode.vue) —— 侧栏菜单递归节点（最多三级，目录可展开/收起，命中路由高亮）
- 旧 DashboardOverview 组件已删除；旧菜单与 RoleMenu 清理逻辑在 seed.ts，本轮不操作数据库
- [`MemberCreateDialog.vue`](../apps/admin/app/components/MemberCreateDialog.vue) —— 新增站点会员弹窗
- [`DemandDetailDialog.vue`](../apps/admin/app/components/DemandDetailDialog.vue) —— 详情/四栏联系方式、跟进状态/单份备注及 IP 禁用/解禁；封禁时展示来源、原因、触发/到期时间，空到期显示“直到人工解除”；操作路径与服务端对齐，共用 `/sites/demands` 授权，不建独立封禁页面；真实数据库与浏览器交互验收仍待完成
- [`NewsDialog.vue`](../apps/admin/app/components/NewsDialog.vue) —— 新闻新建/编辑弹窗（标题 / 发布日期 / 摘要 / 封面图 `ImageField` / 正文 `NewsBodyEditor`（整篇 HTML，编辑区 320px）+ 编辑打开时拉单条详情回显正文）；与案例弹窗统一使用 Element Plus `top="3vh"` 设置顶部间距，`.el-dialog__body` 按视口限高（`calc(100vh - 180px)`）**只在内层滚动**，不再超出屏幕。
- `NewsBodyEditor.vue` 正文样式 —— 仅编辑区与 GEO `site.css` 的 `.art-html` 对齐：14.6px / 1.9、标题、列表文本缩进与间距、表格默认细边 / 8px 内边距；复用管理后台现有字号、间距与颜色令牌，移除图片包裹间距和最小尺寸，不强制图片满宽
- [`NewsBodyEditor.vue`](../apps/admin/app/components/NewsBodyEditor.vue) —— **单可视化正文编辑器（整篇 HTML，ADR-060）**：新闻 / 案例共用 wangEditor，v-model 为**整篇正文 HTML 字符串**（不是块数组），仅可视化编辑，无源码切换；支持 H2/H3 标题（**不提供 H1 入口**，用官方原生 `header2`/`header3`）、字号、文字色 / 背景色、粗斜下划删除、对齐、列表、表格、图片（含左 / 右环绕与取消环绕）、视频与撤销重做；保存原样入库、不做清洗（ADR-061），站点直接展示正文。**字重保留**：仅对登记的正文编辑器扩展 HTML 解析 / 渲染 / 序列化，保留 `font-weight:600/400`，避免规整成粗体或重复包裹 span。**媒体回显**：纯图片 `figure` 转为编辑器可识别的段落（含图注 / 视频 / 其它内容的 figure 不转换），`img/video/source` 的 src 与视频 poster 经 `resolveMediaUrl` 解析；图片 / 视频上传走 `filesApi.upload` 并带来源标签，粘贴 base64 图片入库后按 Slate 节点替换地址，进行中 / 已失败的图片不重复上传。**回显与历史清理**：空 HTML 初始化后通过 `applyHtml` 统一回显，先 blur 再 setHtml，并清空 undo/redo，避免撤销回到程序加载前；原始值与编辑器 HTML 双快照过滤延迟 change 回声，避免回写循环；编辑器只在可见容器初始化（详情页签 `lazy`），销毁后停止回显与异步实例操作
- [`ProductDialog.vue`](../apps/admin/app/components/ProductDialog.vue) —— **产品新建/编辑弹窗（2026-11-03）**：两个页签——「基础信息」（名称 / 中文名 / 系列 / 行业分组多选（必填，空则 warning）/ 卡片说明 / 特性标签（逗号分隔）/ 卡片图片 + 预览 / 导语 / 头部标签 / 头部大图）与「详情内容」（系统说明 `{k,v}`、系统构造 `{role,product,thickness,desc,code}`、系统特点 `{title,desc,icon}`、色卡 `{name,hex}` 带色块预览、常见问题 `{q,a}`；均可留空 = 该区块不输出）
- [`IndustryDialog.vue`](../apps/admin/app/components/IndustryDialog.vue) —— **产品行业分组弹窗（2026-11-05）**：分组名称 / 分组说明（textarea 200 字）/ 排序；不再显示或提交更多文案，产品卡使用固定文案
- [`CaseDialog.vue`](../apps/admin/app/components/CaseDialog.vue) —— **案例新建/编辑弹窗（2026-11 重构）**：两个页签——「基础信息」（标题 / 行业（`el-select` 选取行业分类，filterable 不可新建）/ 业主 / 地点 / 面积 / 年份 / 使用体系主项 + 体系备注 / 卡片图片 + 预览 / 导语 / 头部标签 / 头部大图，头部可选字段留空不展示）与「详情内容」（仅案例正文 `NewsBodyEditor`，整篇 HTML，ADR-060，编辑区 480px，支持图片 / 视频 / 表格；无独立项目画面编辑区）；**「头部标签」与「头部大图」各占独立一行**（不再并排挤压），头部大图旁提供「用卡片图片」一键复用卡片图，留空时服务端派生也自动回落卡片图片；项目信息行由服务端按一级字段派生，弹窗不再拼装；提交带 `bodyHtml`（纯文本列由服务端派生），不读取或提交历史 `images`，避免编辑时覆盖历史数据。**弹窗开 `destroy-on-close` + 详情页签 `lazy`**：每次打开重建编辑器、且只在页签可见时才初始化（避免编辑器在隐藏容器中初始化导致页面卡死）
- [`FaqAnswerEditor.vue`](../apps/admin/app/components/FaqAnswerEditor.vue) —— 问答答案受限富文本编辑器（wangEditor；工具栏仅粗斜下划删除 + 有序无序列表 + 清格式，ADR-058）
- [`FaqRelatedDialog.vue`](../apps/admin/app/components/FaqRelatedDialog.vue) —— 关联问题弹窗（左候选：关键词搜索 + 分类筛选 + 分页；右已选：按顺序上移/下移/移除，上限 8 条；保存空数组＝恢复「同分类其它问答」自动口径，ADR-057）
- [`FaqDialog.vue`](../apps/admin/app/components/FaqDialog.vue) —— 高频问答新建/编辑弹窗（问题 / 分类（allow-create 可输入新分类）/ 上架展示开关（默认开）/ 答案 `FaqAnswerEditor`；编辑打开时拉单条详情回显答案）
- [`MenuFormDialog.vue`](../apps/admin/app/components/MenuFormDialog.vue) —— 菜单新建/编辑弹窗（上级菜单树选择 + 环路排除）
- [`RoleFormDialog.vue`](../apps/admin/app/components/RoleFormDialog.vue) —— 角色新建/编辑弹窗（内置角色标识与状态受保护）
- [`RoleMenusDialog.vue`](../apps/admin/app/components/RoleMenusDialog.vue) —— 角色菜单授权弹窗（勾选子级自动含上级）
- [`AdminUserFormDialog.vue`](../apps/admin/app/components/AdminUserFormDialog.vue) —— 后台用户新建/编辑弹窗（角色绑定 + 启停），已移除站点授权选择与载荷
- [`AccessChart.vue`](../apps/admin/app/components/AccessChart.vue) —— ECharts按需折线/条形图，亮色SCSS令牌转CSS变量；尺寸监听、点击事件和卸载销毁，不独立请求数据
- [`BlockDataForm.vue`](../apps/admin/app/components/BlockDataForm.vue) —— **动态块数据表单**：按 `BlockFieldSchema` 递归渲染 text/textarea/number/switch/select/file/url/link/list/group，`list` 支持增删与上下移；对外暴露 `collectMissing()` 供保存前收集未填必填项
- [`ChannelFormDialog.vue`](../apps/admin/app/components/ChannelFormDialog.vue) —— 目录新建/编辑弹窗（名称 + URL 片段 + 排序）
- [`PageFormDialog.vue`](../apps/admin/app/components/PageFormDialog.vue) —— 页面新建/编辑弹窗（标题/URL 片段/所属目录/类型/摘要；已发布页锁定 slug 与目录）
- [`BlockCreateDialog.vue`](../apps/admin/app/components/BlockCreateDialog.vue) —— 新建块弹窗（归属 + SFC 源码模板）；defaultScope/lockScope 保留，公共模板选项按 `/blocks/templates` 菜单，不按 platform
- [`BlockUsagesDialog.vue`](../apps/admin/app/components/BlockUsagesDialog.vue) —— 块使用位置弹窗（引用页面 + 实例数/启用数）
- [`GeoPreviewDialog.vue`](../apps/admin/app/components/GeoPreviewDialog.vue) —— GEO 预览弹窗（只读展示「系统自动生成」与「实际会输出」）
- [`GeoArtifactsDialog.vue`](../apps/admin/app/components/GeoArtifactsDialog.vue) —— GEO 产物弹窗（查看已构建产物里的 robots.txt / sitemap.xml / llms.txt；「GEO 索引更新」重出索引；「编辑」为非常规兜底的手动替换，会被下次索引更新 / 重建覆盖）
- [`SiteDownloadDialog.vue`](../apps/admin/app/components/SiteDownloadDialog.vue) —— 站点下载弹窗（分包模式：完整包 / 纯静态包；未构建提示先发布、有未发布改动二次确认）
- [`TermHint.vue`](../apps/admin/app/components/TermHint.vue) —— **专有名词说明（问号说明的唯一实现）**：渲染「名词 + ?」，hover/聚焦显示含义；`show-label=false` 只出问号（按钮内用）；问号自带 `@click.stop`，落在按钮里不会误触发动作；文案取自 `~/config/glossary.ts`，弹层统一 `popper-class="term-tooltip"`（宽度 150–300px、行高 1.6、自动换行由 `main.scss` 定义，页面禁止自拼 tooltip；非术语的长文本气泡用同套排版的 `.text-tooltip`，如构建失败原因），用于表单标签（`#label`）、表格表头（`#header`）、正文内联与按钮

### app/middleware

- [`auth.global.ts`](../apps/admin/app/middleware/auth.global.ts) —— 全局路由守卫：未登录跳转登录页

### app/layouts

- [`default.vue`](../apps/admin/app/layouts/default.vue) —— 控制台布局：角色化侧栏菜单 + 顶栏 + 内容区；根路径面包屑为“首页”，不再显示旧仪表盘标题

### app/pages

> 页面级约定：列表表格统一 `el-table` + `border`（列宽可拖拽，样式基线在 `main.scss`）；弹窗一律使用 `app/components/*Dialog.vue` 独立组件，页面只保留 `v-model` 与 `@saved`。

- [`login.vue`](../apps/admin/app/pages/login.vue) —— 登录页（深空控制台风格）
- [`index.vue`](../apps/admin/app/pages/index.vue) —— 等待授权菜单树加载后 replace 跳转首个可点击叶子菜单；无可用菜单显示授权空态，不强制进入监控
- [`sites/index.vue`](../apps/admin/app/pages/sites/index.vue) —— 站点列表（搜索/筛选/分页；**域名映射列**：主域名 + 别名域名；**站点前缀列**：站点标识 `slug`，进编辑页可改；**构建状态列**：未构建 / 排队中 / 构建中 / 构建成功 / 构建失败 + 时间（进行中显示已运行时长，失败悬停看日志尾部；有进行中任务时每 4 秒静默轮询）；操作列「预览」新标签打开**主域名 + 站点前缀**、「编辑」进入深入编辑页、「内容编辑器」进入 `/content/editor?siteId=<id>`、「下载」打开 `SiteDownloadDialog` 下载产物包）
- [`sites/[id].vue`](../apps/admin/app/pages/sites/%5Bid%5D.vue) —— 站点深入编辑页（单页三分区、无 Tab：基本信息（含**站点前缀 slug**、**主域名 + 别名域名增删**）/ 企业资质 / SEO 设置；渲染模式与主题色不在此页）
- [`sites/products.vue`](../apps/admin/app/pages/sites/products.vue) —— **产品体系管理（2026-11-03）**：左侧 260px「行业分组」面板（组名 / 产品数 / 说明摘要 + 编辑、删除、加分组；`productCount > 0` 时前端直接 warning 阻止删除，与服务端 400 口径一致）+ 右侧产品表格（缩略图 + 名称、系列、行业标签、访问路径、状态、操作；筛选 keyword / 系列 / 行业；分页）。弹窗 `ProductDialog`（两页签）+ `IndustryDialog`
- [`sites/cases.vue`](../apps/admin/app/pages/sites/cases.vue) —— **成功案例管理**：按站点隔离 + 关键词 / 行业筛选（行业选项来自分类表 `catalogApi.industries`）+ 新建/编辑/删除；表格列案例（缩略图 + 标题）/ 行业 / 地点 / 面积·年份 / 使用体系 / 访问路径 / 状态 / 操作；弹窗 `CaseDialog`（行业为分类下拉，正文用 `NewsBodyEditor`）
- [`sites/news.vue`](../apps/admin/app/pages/sites/news.vue) —— 新闻资讯管理（按站点隔离：站点切换 + 关键词搜索；表格列标题 / 访问路径 / 发布日期 / 发布状态徽标；操作编辑、删除（删除与保存均由服务端自动触发站点构建）；弹窗 `NewsDialog`）
- [`sites/faqs.vue`](../apps/admin/app/pages/sites/faqs.vue) —— 高频问答管理（按站点隔离：站点切换 + 关键词搜索 + 分类筛选（选项来自分类接口，清空 = 全部）+ 上架状态筛选（全部 / 只看上架 / 只看未上架）；表格列问题 / 分类 / 访问路径 / 上架开关（行内即时生效，只影响列表页展示，详情页保留，ADR-055）/ 发布状态徽标；操作关联问题（`FaqRelatedDialog`，ADR-057）、编辑、删除；弹窗 `FaqDialog`，新分类保存后刷新分类清单）；答案为受限富文本（`FaqAnswerEditor`，ADR-058）
- [`sites/demands.vue`](../apps/admin/app/pages/sites/demands.vue) —— “站点管理 → 需求收集”的站点/状态/关键词分页与独立详情；loading 互斥下版本化串行补查最新条件，旧响应不回写，失败仍补查，卸载停止回写与补查；站点选项与列表并行独立加载；菜单定稿 `/sites/demands`，封禁共用此授权；新增菜单不自动扩大既有角色授权
- [`content/index.vue`](../apps/admin/app/pages/content/index.vue) —— 页面列表（状态三态、GEO 分、提交审核与发布）
- [`content/[id].vue`](../apps/admin/app/pages/content/%5Bid%5D.vue) —— 页面编辑器（模板 + 结构化 Block 表单 + 右侧 GEO 体检）
- [`content/editor.vue`](../apps/admin/app/pages/content/editor.vue) —— **站点内容编辑器工作台**（09 §6.2）：工具条（站点切换 + **构建状态**（未构建 / 排队中 / 构建中 / 构建成功 / 构建失败 + 时间或已运行时长，失败可悬停看原因；进行中每 3 秒轮询并在结束时刷新左树与徽标 + 提示结果）+ **增量发布**（带 `?` 说明）+ **整站重建** / **GEO 索引更新**（接通既有 `/publish/site`、`/publish/repair` 接口，三个动作各带 `?` 说明，问号统一由 `TermHint` 渲染；**进行中三个按钮全部禁用**，增量发布与整站重建转圈）+ 刷新）、左列可搜索内容树（目录/页面/块 + 发布徽标，点目录即打开其下第一个页面）、右侧预览 iframe 占满一屏（走 `/preview/ticket`，头部展示预览态标记 + 页面**访问地址**可复制）、「页面 / 块 / 发布」改为右侧抽屉（页面：草稿字段 + SEO + 编审 + JSON-LD 双模式；块：实例清单（块标识下列出**块名称与用途说明**，定义批量预取）+ 动态数据表单 + 「编辑代码」新标签页打开块代码；发布：状态 + 发布/回退 + GEO 体检）
- [`blocks/index.vue`](../apps/admin/app/pages/blocks/index.vue) —— **块库（本站块）**：本站块 + 公共模板（归属筛选 / 「已引入」标记 / 未引入可「引入本站」）；操作：使用位置、编辑代码（新标签页）、引入本站、回退上一版
- [`blocks/templates.vue`](../apps/admin/app/pages/blocks/templates.vue) —— **块模板库**（平台级）：公共模板（`siteId=0`）的新建 / 编辑代码（新标签页）/ 回退上一版；模板只作初始代码，改模板不影响已引入的站点（ADR-035）
- [`blocks/[key].vue`](../apps/admin/app/pages/blocks/%5Bkey%5D.vue) —— 块代码编辑器（源码 textarea + 行号 gutter + 错误行标红；右侧只读字段声明表；下方使用位置；`siteId=0` 编模板、其余编本站块，未引入时提示「保存会复制一份到本站」；由列表以新标签页打开）
- [`files.vue`](../apps/admin/app/pages/files.vue) —— 素材管理（`static_files` 可视化入口）：站点筛选 + 关键词搜索（文件名 / 地址 / 来源 / 备注）+ 多选上传（图片 ≤2MB、视频 ≤100MB）、图片缩略预览（视频显示播放标记）、**「上传来源」列**（`source`，标注哪个功能传的）、复制访问地址、**ID 固定宽度单行 + 点击复制**、替换（隐藏 file input，accept 限定原文件 MIME，`PUT /files/:id/replace` 替换内容、引用地址不变）、删除
- [`navigations.vue`](../apps/admin/app/pages/navigations.vue) —— 导航管理（头部主导航 + 页脚四列分组，条目增删排序、站内页面/外部链接二选一，整组全量覆盖保存）
- [`members/index.vue`](../apps/admin/app/pages/members/index.vue) —— 站点会员管理
- [`monitor/index.vue`](../apps/admin/app/pages/monitor/index.vue) —— 访问记录：复用公共 `.filter-bar` / `.filter-actions`，筛选靠左、查询与重置整组靠右，空间不足整体换行仍右对齐；消费分析下钻及路由查询变化，默认20条分页；loading互斥下版本化串行补查，旧响应及卸载后不回写，站点请求独立；保留DB-IP署名
- [`monitor/analysis.vue`](../apps/admin/app/pages/monitor/analysis.vue) —— 访问分析：统一筛选、七日默认与快捷范围；日期时间框固定384px不伸展、控件统一28px高，普通筛选128px/站点192px，复用公共 `.filter-bar` / `.filter-actions`，筛选靠左、快捷范围与查询操作各组靠右，空间不足整体换行仍右对齐，间距仅由8px gap控制；summary全量聚合四指标、类别/趋势及Top10榜单、GEO资源/响应/去敏来源/历史地域；趋势图例置顶与网格分离，日期轴按月日/小时简写并保留完整时间tooltip，间距按8px档位；查询版本串行补查、错误/空态；使用已完成查询下钻类别/代理/资源/304与裁剪边界的时间桶，不伪装Host+路径精确下钻
- [`settings/index.vue`](../apps/admin/app/pages/settings/index.vue) —— 系统设置 · 运行配置（平台级，展示账号与角色/接口基址/时区/静态资源/AI 爬虫策略）
- [`settings/users.vue`](../apps/admin/app/pages/settings/users.vue) —— 系统设置 · 用户管理（菜单授权，CRUD、角色绑定与启停），已移除站点授权列与站点选项加载
- [`settings/roles.vue`](../apps/admin/app/pages/settings/roles.vue) —— 系统设置 · 角色管理（平台级，角色增删改查 + 菜单授权树，内置角色受保护）
- [`settings/menus.vue`](../apps/admin/app/pages/settings/menus.vue) —— 系统设置 · 菜单管理（平台级，三级菜单增删改查，保存后侧栏即时生效；可见性由角色授权决定）

---

## /apps/geo（GEO 项目）

站点渲染引擎：一套代码渲染多站点，支持站点级 **SSG / SSR 双模式**。

### 工程文件

- [`package.json`](../apps/geo/package.json) —— 依赖与脚本（含 `build:sites` 增量 SSG（根命令 `pnpm site build` 调它）、`blocks:sync` 块代码落盘、`start:prod`：`node .output/server/index.mjs` 供上线器常驻 SSR）
- [`nuxt.config.ts`](../apps/geo/nuxt.config.ts) —— SSG 产物目录、prerender 钩子、构建期环境变量、开发端口（读注入的 `PORT`）；Nuxt/Nitro与Vite同源开发代理按配置API origin/pathname派生，生产不启用；组件自动导入 `pathPrefix: false`
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

- [`PageRender.vue`](../apps/geo/app/components/PageRender.vue) —— 页面渲染：加载数据 → 注入 GEO 元数据（meta/JSON-LD/canonical，统一经 `useHead` 注入，模板内禁止写 `<script>`）→ 渲染 Block（`time` 发布时间在此；页头 `h1` 只在「无首屏块且首块非 section-head」时兜底渲染，判定见 `utils/page-title.ts`，ADR-056）
- [`MemberBadge.client.vue`](../apps/geo/app/components/MemberBadge.client.vue) —— 会员入口（客户端 island：静态站登录后由浏览器调用 member API；登录表单含 `label` 绑定）
- [`DemandWidget.client.vue`](../apps/geo/app/components/DemandWidget.client.vue) —— 根组件统一挂载：首页与主体页共用需求主体，开发API使用同源origin+配置pathname，生产保留绝对基址；初始化错误显式展示，不执行导航降级
- [`blocks/BlockRenderer.vue`](../apps/geo/app/components/blocks/BlockRenderer.vue) —— Block 分发渲染器：`import.meta.glob('./Blk*.vue')` 构建期收集块组件表，按 `Blk<PascalCase(key)>` 动态解析（不用 `resolveComponent`，缺失块渲染为显式占位而非静默空白），跳过停用块，输出 `data-block-id`；产品体系 `/products` 的行业分组编排为顶部 Tab，默认首组、说明下置，保留 SSR 全量内容与锚点切换，支持键盘和移动端横向滚动
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

### server/middleware（当前入口与未验收边界）

- [`site-entry.ts`](../apps/geo/server/middleware/site-entry.ts) —— Host站点定位、生产SSG直出与SSR兜底；Nuxt开发模式放行源码渲染，避免旧SSG覆盖当前组件/资产；访问日志由前置00-access.ts采集，widget版本资源在产物查找前放行
- [`00-access.ts`](../apps/geo/server/middleware/00-access.ts) / [`../utils/access.ts`](../apps/geo/server/utils/access.ts) —— 采集入口调用 observeAccess/recordAccess，直接读取 `TRUSTED_PROXIES` 并使用既有内部令牌逐条异步上报；服务端 AccessModule 已注册。具体能力亦见本地图后文，代码接入不代表 finish/close、去敏、可信代理或真实数据库保存链路已验收（05 §7.1、07 §3.3.1）
- [`../widget/loader.ts`](../apps/geo/widget/loader.ts) —— 独立外链加载器：暴露 TrillionDemand.mountDemand/openDemand，幂等准备与失败重试，不监听 document 事件、不绑定页面按钮
- [`../widget/widget.ts`](../apps/geo/widget/widget.ts) —— Shadow DOM + 原生 dialog 的聊天外观需求表单；桌面上限 400px、13px 字号及紧凑间距，按钮「提交需求」；成功隐藏引导和表单，仅展示「已收到您的需求，我们会尽快与您联系」，重新打开恢复引导；四栏任填、错误保留输入、网络不确定失败复用提交快照/幂等键、焦点及移动端内滚动；不发访客 token、不写需求到站点产物
- [`../app/utils/demand.ts`](../apps/geo/app/utils/demand.ts) —— 自有站点组件直接初始化既有Shadow DOM主体并复用Promise，失败清理Promise允许重试；按钮openDemand(trigger)直接打开，不加载外链、不判断点击、不preventDefault、不href降级
- [`hero-dark.vue`](../apps/server/prisma/blocks/hero-dark.vue) / [`scene-hero.vue`](../apps/server/prisma/blocks/scene-hero.vue) / [`telbar.vue`](../apps/server/prisma/blocks/telbar.vue) —— 真实块源显式调用 openDemand；scene-hero 与本地 BlkSceneHero 同步 ghost 入口透明白字（常态/hover/focus/disabled），避免原生按钮灰底；当前目录 BlkHeroDark/BlkSceneHero/BlkTelbar 从真实源同步事件，不做构建期补标记，不执行数据库或站点发布
- [`forintech.json`](../scripts/data/forintech.json) —— 建站描述首页次按钮同步「联系我们 → /contact」；现有 development 首页以数据库 scene-hero 为真实来源，本轮定向更新其次按钮，核对其他主体页，横幅提交需求及顶部电话/导航保留
- [`forintech-actions.test.mjs`](../aiTest/forintech-actions.test.mjs) / [`forintech-actions-update.mjs`](../aiTest/forintech-actions-update.mjs) —— 本地忽略入库的先红后绿回归与定向更新脚本；备份本站页面/块、编译校验后更新稳定标记与内容指纹，导航/站点/授权保持，publishedHash 不伪写；本地 SSG 重建不代表生产发布
- [`forintech-artifacts.test.mjs`](../aiTest/forintech-artifacts.test.mjs) / [`forintech-built-browser.mjs`](../aiTest/forintech-built-browser.mjs) / [`forintech-actions-verification.md`](../aiTest/forintech-actions-verification.md) —— 117 条正式产物机械检查、独立本地浏览器点击检查与部分验收记录；浏览器未通过项单独列出，不等同于全部主体页交互验收
- [`../server/routes/demand-widget/v1/[asset].get.ts`](../apps/geo/server/routes/demand-widget/v1/[asset].get.ts) —— 版本化 loader.js/widget.js 独立脚本响应，公开短缓存、nosniff；site-entry 在站点产物查找前放行此资源，避免旧 SSG 资源副本覆盖主体更新
- [`../app/app.vue`](../apps/geo/app/app.vue) / [`../nuxt.config.ts`](../apps/geo/nuxt.config.ts) —— 根组件统一DemandWidget；Vite剥离defineBlock、不动态补标记，开发同源代理；独立外链资源保留，当前目录开发验证不更新旧SSG/数据库/nginx
- [`demand-direct.test.mjs`](../aiTest/demand-direct.test.mjs) / [`demand-direct-browser.mjs`](../aiTest/demand-direct-browser.mjs) —— 本轮最小红绿测试及3002首页/主体页真实按钮、验证码、关闭焦点和导航验证；证据均落aiTest，旧demand-explicit测试为已替代行为的历史记录
- [`demand-compact.test.mjs`](../aiTest/demand-compact.test.mjs) —— 仅本地 3002 的紧凑弹窗回归：入口常态/hover/disabled/打开后透明白字、提交互斥、成功隐藏引导、重开与移动端限高；先红后绿，验证码及成功响应替身不写数据库，截图与 JSON 证据同落 aiTest，不代表生产验收。
- development 本地需求链路：`DemandWidget.client.vue` 取已解析的本站上下文，`widget.ts` 显式发送 X-Development-Site；`demands.controller.ts` 仅 development 回环直连且回环来源允许此头，`demands.service.ts` 按 active slug 归属，生产/test 保持域名校验与真实 sourceUrl 核对。`aiTest/demand-development.test.ts` 覆盖本地通过、未知站点/远程/生产拒绝及来源一致性；`aiTest/demand-local-browser.mjs` 验证首页/主体页五个入口、单挂载和同源请求，`aiTest/demand-local-db.mjs` 只读回查development验收需求；证据见 `aiTest/demand-local-verification.md`。仅使用既有端口与回环地址，不改hosts或数据库结构，不代表生产验收。

2026-11-06 权限续作：按 REQUIREMENTS §9、05 §2 与用户授权同步 02 及地图；全部管理业务控制器接入登录 + 菜单守卫，移除 siteIds/platform 业务拒绝和站点授权 UI，保留归属、模板副本、会员/内部身份与防锁死。历史“限平台级/按用户站点隔离”条目不再作为业务权限要求。数据库 site_ids 历史列暂留，无结构迁移，无自动菜单补授、无发布。

权限验证脚本 [`aiTest/menu-permissions.test.ts`](../aiTest/menu-permissions.test.ts) 为忽略入库的本地测试：路由元数据全覆盖、真实 Nest HTTP 的401/403/跨站非平台读写、主动筛选、DTO/身份字段、目录与预览归属、会员身份、防锁死、模板权限防伪造。运行目录 apps/server：`node -r ts-node/register/transpile-only --test ../../aiTest/menu-permissions.test.ts`（NODE_PATH 指向该应用 node_modules，TS_NODE_PROJECT 指向该应用 tsconfig.json，保留 Nest 装饰器元数据）。Prisma 替身不代表真实数据库验收。

访问分析本地验收脚本 [`aiTest/access-analysis-live.mjs`](../aiTest/access-analysis-live.mjs)：仅 development 回环地址与开发库，凭据沿用环境变量或种子源码内存读取；先确认账号角色独占，再按已有授权判断401/403/200前置状态，显式补齐GEO父目录与分析菜单。成功保留仅该账号必要授权，失败撤回本次新增项；真实 Edge 浏览器验证菜单导航、聚合、空态、今天、缩放与304下钻，仅500错误场景使用响应替身。首轮及已有授权重跑均通过，证据/截图/交付记录仅落aiTest，不执行种子、迁移或生产发布。

### app/utils

- [`api-base.ts`](../apps/geo/app/utils/api-base.ts) —— 服务端 API 基址读取（缺失即报错，统一出口，不再内置默认地址；客户端在回环基址下按浏览器主机名自适应，便于同局域网访问）；`LOOPBACK_HOSTS` 转发自 `@trillion/shared`（唯一实现在 `shared/utils/geo-url.ts`，本工程不另立清单）
- [`theme.ts`](../apps/geo/app/utils/theme.ts) —— 站点主题令牌 → CSS 变量：`DEFAULT_THEME_TOKENS`（设计稿基线）、`themeStyle`（供 `:style` 绑定）、`themeRootCss`（注入 `:root` 的 `<style>` 文本）；**默认值必须与设计稿 `theme-b.css` 及后台/服务端默认值三处一致**（AGENTS.md §7，09 §7.4）
- [`block-context.ts`](../apps/geo/app/utils/block-context.ts) —— 块渲染上下文装配（`context.site / page / channel / block / items / entities / now / locale`，见 09 §5）
- [`page-title.ts`](../apps/geo/app/utils/page-title.ts) —— **H1 归属判定（ADR-056）**：`resolveTitleSource(blocks)` 返回 `hero` / `section-head` / `fallback` 与担任主标题的块 id，`PageRender`（是否补页头）与 `BlockRenderer`（注入 `context.pageTitle`）、`section-head` 块（渲 h1 还是 h2）共用这一份结论
- [`head-extra.ts`](../apps/geo/app/utils/head-extra.ts) —— 站点级 head 扩展解析与净化（`parseHeadExtra` / `toHeadGroups`，服务端已剔除脚本）

### public/（设计稿资产直出，2026-10-08 新增）

> 由 Vite 的 `public/` 机制原样复制进产物根，构建后落进 `sites/<slug>/assets/**`（ADR-036 / ADR-037）。
> `build-sites.mjs` 的 `computeAppFingerprint()` 已含 `public`，本目录任何变更会变更 `appHash` 并强制 `nuxt build`。

- `public/assets/css/theme-b.css` —— 设计稿原型基础样式（**原样复制，不得改选择器**，09 §7.4.1）
- `public/assets/css/site.css` —— 设计稿站点级布局样式（沿用原型选择器与主题令牌）；整篇 HTML 正文 `.art-html` 与 `NewsBodyEditor.vue` 对齐基础字体、14.6px / 1.9 行高、标题字重与间距、列表缩进、表格细边与单元格内边距，保留内容内联样式；图片按原尺寸 / 内容宽度展示，仅限制最大宽度，不强制拉满
- `public/assets/css/presets/` —— 站点级样式预设（ADR-048），由 `themeTokens.stylePreset` 按文件名加载：
  - `industrial.css` —— 工业站暗色工程预设（forintech 初版视觉，ADR-051 后退役不再被引用，保留文件备查）
  - `blueprint.css` —— 「图纸白」亮色预设（forintech 改版视觉，钢蓝 #185FA5 + 安全橙 #E8590C + 等宽规格数字 + 工程网格底，ADR-051；定义 `--on-brand` / `--hero-accent` 变量与交互块对接）
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
- `server/middleware/00-access.ts` —— 响应后访问采集入口：预览与站点入口之前注册 finish/close，覆盖所有到达 GEO 的请求；构建渲染进程跳过，使用既有内部令牌逐条异步保存，不等待结果、不改 widget
- `server/utils/access.ts` —— GEO 服务端访问工具：IPv4/IPv6 归一化、可信 CIDR 与代理链、URL/Referer 敏感信息剔除、资源与 UA 声明分类（附证据/用途）、单次生命周期快照、内部保存错误捕获；无新依赖，不持有 req/res 进入保存过程
- `server/middleware/site-entry.ts` —— 站点统一入口中间件（ADR-045）——Host 非回环时按域名解析站点（内存缓存 + 负缓存），优先直出 `sites/<slug>/` 产物文件（`fileOfPath` 口径，HTML no-cache + 304、`_nuxt` immutable），未命中放行 SSR 兜底；原 `[access]` stdout 日志移交 `00-access.ts` 响应后上报；产物根可用 `SITE_PRODUCTS_DIR` 覆盖。**依赖 `nuxt.config` 的 `nitro.serveStatic: false`**（否则 nitro 内嵌资产层先拦 `_nuxt/**`）
- `server/routes/static/[...path].ts` —— 新增：`/static/**` 同源代理（Nitro 路由 → 服务端素材库 `useStaticAssets`，透传状态码 / content-type / 查询串，dev SSR 与渲染服务共用）
- `scripts/build-sites.mjs` —— **改动**：复制现有产物 → 增量生成 → 全量索引与主站索引 → 合并清单 → 清理下线页 → 保留上一版；2026-10-07 进一步改为「构建缓存判定（命中跳过 Vite）+ SSR 爬取 targets + 跨站点构建锁」（ADR-032）
- `scripts/sync-blocks.mjs` —— 新增：块代码落盘（数据库 → `app/components/blocks/Blk*.vue`，幂等跳过未变化块）
- `nuxt.config.ts` —— **改动**：组件自动导入 `pathPrefix: false`、`publicDir` 指向构建期产物目录、prerender 关闭（ADR-032）；`nitro.serveStatic: false`（ADR-045）——nitro 内嵌静态资产层在 server middleware 之前且未命中即 404 短路，会拦截多站点 `_nuxt` 资产请求，运行时静态服务统一交给 `server/middleware/site-entry.ts`

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
