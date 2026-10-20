# AGENTS.md · AI 开发规范

> 本文件是 AI / 开发者在本仓库工作的**第一入口**。文档分五层，冲突以上游为准：
> **`AGENTS.md`（本文件）→ `docs/REQUIREMENTS.md`（需求基线）→ `docs/spec/`（架构规格）→ `docs/PROJECT_STRUCTURE.md`（文件地图）→ 代码**

## 0. AI 阅读纪律（强制，先于一切动作）

1. **先查地图，再碰代码**：任何任务开始前，先读 `docs/spec/INDEX.md` 的阅读地图（§3），按当前任务角色选**对应编号文档**，再用 `docs/PROJECT_STRUCTURE.md` 定位目录，最后才读相关代码。
2. **禁止全量通读**：禁止为"了解项目"而顺序通读 `docs/` 全部文档，或扫描整个代码目录。单次任务阅读预算：本文件 + 任务相关的 spec 编号文档 ≤2 份 + 文件地图相关小节，超出即为违规。
3. **按任务选读**：服务端任务读 02/04/05；管理后台任务读 03/05；发布与 GEO 读 06；部署读 07；站点编辑器读 09；需求与验收读 REQUIREMENTS.md。不确定选哪份时，只读 INDEX.md 再决定，不要全读。
4. **发现 spec 与代码不一致**：先停下报告并请人裁决，不得静默采信任何一方。
5. **架构级改动**（跨模块、数据模型、接口、发布、部署）：必须先更新 `docs/spec/` 对应编号文档再动代码；文件增删改必须同步 `docs/PROJECT_STRUCTURE.md`。

---

## 1. 项目定位

集团多站点 CMS 平台。核心商业目标是 **GEO（生成式引擎优化）驱动的获客与推流营销**，传统 SEO 并重。

## 2. 术语（强制）

| 术语         | 指代                              | 目录          |
| ------------ | --------------------------------- | ------------- |
| **GEO 项目** | 生成的站点 / 站点渲染引擎         | `apps/geo`    |
| **管理后台** | admin 管理端                      | `apps/admin`  |
| **服务端**   | 数据层（NestJS + Prisma + MySQL） | `apps/server` |

禁止在文档、注释、对话中出现 admin/web 等旧称谓指代上述实体。

其余**专有名词**（slug / canonical / 产物清单 / 内容指纹 / 块标识 / 预览票据 …）统一解释见
[`docs/GLOSSARY.md`](docs/GLOSSARY.md)；后台界面上的问号提示文案唯一来源是
[`apps/admin/app/config/glossary.ts`](apps/admin/app/config/glossary.ts)——
页面里**禁止硬编码**这些名词与解释，取值用 `TERMS.<key>.label`、出问号用 `<TermHint term="<key>" />`。

## 3. 技术栈

- Monorepo：pnpm workspace（根 `package.json` 只放 workspace 脚本）
- 前端 ×2：Nuxt 4 + TypeScript；管理后台 Element Plus + SCSS
- 后端：NestJS + Prisma + MySQL（utf8mb4）
- 共享包：`packages/shared`（类型契约）
- 规范：ESLint + Prettier（配置见根 `.prettierrc`）；**无 husky / lint-staged / commitlint**

## 4. 目录与配置约定

- **全局配置（与 apps/ 同级，2026-10-06 起）**：
  - `env/`（**只放值**）：`env/.env.<环境>`，环境取 `development` / `test` / `production`（或自定义，`--env` 指定）；`env/.env.production` 不入库，模板为 `env/.env.example`
  - `config/`（**只放结构与派生**）：端口表 `ports.mjs`（server 3001 / admin 3000 / geo 3002，**端口唯一事实来源**）、应用清单 `apps.mjs`、加载与派生 `index.mjs`、环境解析 `env.mjs`
  - ⚠️ **应用内禁止出现端口与数据库字面量**：三个工程都不再自带 `.env`，变量缺失即启动失败；新增变量先加 `env/.env.example` 与 `config/index.mjs`，再改应用
- **管理后台**：所有 API 调用统一收口 `app/config/api/`，按业务模块拆分文件；页面/组件禁止硬编码接口 URL。配置化字段（菜单、字典、常量）放 `app/config/`
  - ⚠️ 引用 `app/config/` 下的模块**必须用 `~` 别名**（`~/config/api`、`~/config/menu`）。相对路径 `../../config/api` 会被 Nuxt 的 import-protection（impound）误判为 Nuxt 构建期模块，构建直接失败
- **前端端口写法**：Nuxt 从注入的 `PORT` 读开发端口（`nuxt.config` 的 `devServer.port`）；**不要用 `--port` 传参**，经 pnpm 转发会被 Nuxt 当成 rootDir
- **服务端**：配置化内容统一放 `src/config/`（含 zod 启动校验，值的来源是 `env/` + `config/`）；Prisma 模型放 `prisma/schema/` 多文件模块化；**每个 model 与字段必须用 `///` 打中文注释**
- **GEO 项目**：页面 = 模板 + 结构化 Block；SSG 构建脚本 `scripts/build-sites.mjs`
- **根 scripts/**：`dev.mjs`（开发启动器：先释放端口再并发启动，各工程就绪后打印访问入口清单）、`release.mjs`（**代码**上线器：体检 → 构建 → 生产模式启动，**不碰数据库**）、`db-release.mjs`（**数据库**上线器：体检 → `migrate deploy` → 复核，唯一改结构入口）、`pm2-config.mjs`（PM2 配置生成器）、`pack-deploy.mjs` + `deploy-runtime/`（**部署包**打包器与运行时模板，产出仓库根 `deploy/`）、`port-guard.mjs`（端口查询/结束/释放，启动器共用）、`exec.mjs`（以全局配置执行包脚本）、`pnpm.mjs`（pnpm 调用封装）；零第三方依赖
- **无每目录 README.md**：目录与文件说明统一维护在 `docs/PROJECT_STRUCTURE.md` 一个全局文件
- **架构规格统一维护在 `docs/spec/`**（编号体系：`INDEX` + `00`~`09`）。新增/修改组件、数据表、接口、发布流程、部署形态、**站点编辑器与块代码化**前，先改对应编号文档，再动代码；维护责任表见 `docs/spec/INDEX.md` §4

## 5. 数据库约定

- 本地：127.0.0.1:3306，root/111，库名 `trillionCms`（值定义在 `env/.env.development`；测试环境为 `trillionCms_test`）
- 时区 Asia/Shanghai，时间字段 `@db.DateTime(0)`（格式 `2026-10-05 10:10:10`）
- **时间输出**：Prisma 对 DATETIME 按 UTC 读写，接口一律走 `src/common/utils/datetime.ts` 的 `formatDateTime`（中国时区）；**禁止用 `toISOString()` 输出业务时间**
- 所有内容表挂 `siteId`，查询必须带站点过滤（见 `src/common/utils/site-scope.ts`）
- **主键与 ID（强制，ADR-043）**：所有表主键为应用生成的字符串 ID（`id String @id @db.VarChar(36) @default(uuid(7))`），所有外键列同为 `String @db.VarChar(36)`；**禁止 `@default(autoincrement())` 与数据库侧 `AUTO_INCREMENT`**（复合主键如 `RoleMenu` 可保留，但不得含自增列）；**字符串 ID 不替代主键约束**——每张表仍必须有真实 PRIMARY KEY；新增/修改数据表前先读 `docs/spec/04-data-model.md` §2.1，改 ID 形态属架构级改动（先改 spec 再动代码，见 ADR-043）
- **迁移命令分环境**：本地用 `pnpm db:migrate`（`prisma migrate dev`，可能提示 reset，**禁止**在测试/生产使用）；测试 / 生产用 `pnpm db:status[:env]`（只读看）+ `pnpm db:deploy[:env]`（`prisma migrate deploy`，只应用未执行的迁移，非交互、幂等、空库自动建库）
- **数据库发布与代码上线是两条命令（强制）**：`pnpm release:*` **只发布代码、绝不改数据库**；结构变更一律走 `pnpm db:deploy*`。有结构变更时顺序为「先 `db:deploy` 再 `release`」，代码上线器的体检会只读检查并在结构落后时拦下
- **共享包**：`packages/shared` 是编译型包，`pnpm build:server` 已内置 `build:shared`；GEO 项目 `prepare` 也已内置先构建 shared（fresh clone 后 `pnpm install` 不会因 dist 缺失失败，根因见 `docs/spec/10-launch-runbook.md` §11）；改完 shared 类型后需重新构建服务端；服务端 `build` 脚本已内建 `prisma generate`（`prisma generate && nest build`），schema 变更后走 `pnpm build:server` / `pnpm release*` 会自动重生成 Prisma Client

## 6. 开发流程（强制）

1. 阅读本文件 + `docs/REQUIREMENTS.md` 对应章节
2. 阅读 `docs/spec/INDEX.md`，按角色进入对应编号文档：服务端 `02`、前端 `03`、数据模型 `04`、接口 `05`、发布与 GEO `06`、部署 `07`、决策背景 `08`
3. 阅读 `docs/PROJECT_STRUCTURE.md` 中相关目录/文件说明，确认现有职责边界
4. 编码：遵循既有目录结构与命名；新文件必须带**头部注释说明用途**
5. **架构级改动**（跨模块调用、数据表/字段、接口契约、发布流程、部署形态、渲染模式）必须先更新 `docs/spec/` 对应编号文档；遇到"二选一"的取舍要在 `docs/spec/08-adr.md` 新增 ADR（标 superseded，勿删旧条目）
6. 更新 `docs/PROJECT_STRUCTURE.md`：新增/删除/修改文件后同步对应条目
7. 如需求发生变更，先更新 `docs/REQUIREMENTS.md` 再改代码

## 7. 编码规范

- TypeScript 全栈，`import type` 只导入类型
- 统一响应结构 `{ code, message, data }`（服务端 `TransformInterceptor` 产出，前端 `app/config/api/http.ts` 消费）
- 管理后台 UI：12px 基准字号、8px 间距栅格、密度优先、**亮色主题配色**
- **颜色唯一来源（强制）**：
  - 后台 UI 主题色只在 `apps/admin/app/assets/scss/tokens.scss` 定义；页面用 SCSS 令牌或 `.c-*` 语义类，Element Plus 主色梯度由 `color.mix()`（`@use "sass:color"`）从 `$c-primary` 派生（**禁写全局 `mix()`**：Dart Sass 已弃用，dev/build 会刷 DEPRECATION WARNING，3.0 将移除）
  - 站点主题默认值只在 `apps/admin/app/config/site-defaults.ts` 定义（与后端 `apps/server/src/modules/sites/constants.ts` 的 `SITE_DEFAULTS.theme` 对齐）
  - **TS / Vue 内出现颜色字面量会被 ESLint 直接拦截**（`no-restricted-syntax`），不要把色值散落到页面或字典里
- 数字展示统一等宽字体
- **表格（强制）**：数据表格统一用 Element Plus `el-table` 并开启 **`border`**（border 模式下才可自由拖拽列宽）；**禁止手写 `<table>` 模拟数据表格**；border 表格所在面板不再叠加边框（外框由表格承担，样式基线在 `app/assets/scss/main.scss`）
- **弹窗（强制）**：所有 `el-dialog`（不论大小）必须独立成 `app/components/*Dialog.vue` 组件——用 `defineModel` 控制显隐、`emit('saved')` 通知父页面刷新；**页面文件内禁止内联 dialog 内容**
- **页面布局与间距（强制）**：
  - 页面主功能区固定在布局的 `.content` 内，**一屏内滚动**：`html/body` 已 `overflow: hidden`，`.main` 用 `min-height: 0` 防止 flex 撑开退化成整页滚动；页面内容溢出时滚动条只出现在 `.content`
  - 间距统一走 8px 档：页面容器 padding/gap、筛选栏 gap、面板标题 padding 一律 `$sp-1`（需要更大间隔才用 `$sp-2`），**禁止临时写像素值与颜色**
- **Element Plus 尺寸基准**：全局 `size: 'small'`（在 `plugins/element-plus.ts` 统一设置），与后台密度规范一一对应；页面组件无需再逐个写 `size="small"`
- **分页（强制）**：所有列表**默认每页 20 条**，档位 `[10, 20, 30, 50, 100]`；前端唯一来源 `app/config/pagination.ts`，服务端唯一来源 `src/common/constants.ts`（两处必须一致），列表页必须提供每页条数选择
- **操作列文案与语义色（强制）**：操作列按钮**一律用 `el-button link size="small"`**（跳转动作也用 `navigateTo`，不与 `NuxtLink` 混用，否则间距与颜色会漂）；**文案按词典统一**——新建 / 编辑 / 删除 / 保存 / 提交审核 / 发布 / 刷新 / 上传 / 取消 / 返回（禁止"新增、删、确定、提交"等同义混写）；**颜色按语义统一**——主操作 `primary`（新建/编辑/保存/详情）、正向流转 `success`（发布/提交审核/启用）、破坏性 `danger`（删除/停用）、中性辅助用默认色（预览/刷新/授权/加子菜单/上传）；按钮顺序固定为 预览 → 编辑 → 流转 → 删除（危险动作永远最后）；**列宽与换行**——操作列统一挂 `class-name="ops-col"`（间距/换行/禁止省略号的规格定义在 `main.scss`，页面只给列宽）：按钮排不下时必须**换行**，**禁止出现省略号**（省略号等于按钮从界面上消失）；列宽按「按钮数 × 约 40px + 16px 内边距」估，如站点行 5 个按钮取 210px
- **按钮防抖 + loading（强制，两者是独立概念不要混用）**：时间维度用 `debounce(fn, DEBOUNCE_WAIT)`（`app/utils/tool.ts`，默认 `leading: true` 即**先触发后防抖**——首次立即执行、窗口内重复调用被过滤），状态维度用 `useLoading()`（`run` 整块互斥 / `runKeyed(key, fn)` 行级互斥 + `isLoading(key)` 绑按钮 `loading`）；写操作按钮统一写法 **防抖在外、loading 在内**：`const onSave = debounce(() => run(async () => { ... }), DEBOUNCE_WAIT)`。**禁止各页面自写防抖逻辑或裸调接口**
- **语义化标记（分区要求）**：`apps/geo`（GEO 项目 / 站点渲染引擎）及其 **Block 组件必须严格遵循 HTML5 语义化规范**（页面骨架、唯一 H1、层级不跳级、文本/时间/联系信息/图文/表单语义标签、JSON-LD 经 `useHead` 注入），完整清单见 [`docs/spec/03-frontend-architecture.md`](docs/spec/03-frontend-architecture.md) §4；`apps/admin`（管理后台）**不要求**语义化（SPA 内部工具），统一用 Element Plus 组件与布局 `div`，**禁止为"语义正确"额外重构后台结构**
- 提交前执行 `pnpm lint` 与 `pnpm format`；两者必须同时干净
  （若刚执行过 `pnpm add/remove`，先跑一次 `pnpm install`：pnpm 重链接依赖期间 `pnpm lint` 可能报 `MODULE_NOT_FOUND`，属瞬时状态，重跑即恢复）
- `vue/html-self-closing` 的 void 元素必须放行（`html: { void: 'any' }`，见两个前端的 `eslint.config.mjs`）：
  Prettier 对 `input` / `img` 等 void 元素输出自闭合 `/>`，ESLint 规则若要求"不写自闭合"，`pnpm lint` 与 `pnpm format` 会互相拆台（改完一方，另一方立刻报错）

## 8. 禁止事项（详见 REQUIREMENTS.md §14）

不得擅自加入：husky/commitlint、changelog.md、每目录 README、Element UI、Nuxt 3、npm/yarn、纯 JavaScript、富文本自由编辑 Block、v1 多语言内容/版本回滚/CI。

## 9. 常用命令

```bash
pnpm install                       # 若环境禁符号链接：pnpm install --node-linker=hoisted
pnpm build:shared                  # packages/shared 编译（服务端类型依赖）
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm allDev                        # 一键启动全部工程（开发形态：源码直跑；先结束占用端口的旧进程；
                                   # 服务端 3001 / 管理后台 3000 / GEO 项目 3002；Ctrl+C 全部结束）
pnpm allDev:test                   # 用 env/.env.test 启动（3101 / 3100 / 3102）
pnpm dev:server | dev:admin | dev:geo   # 单独启动某一端（同样先释放端口）
pnpm db:status[:env]               # 数据库只读检查：目标库 + 已应用 / 未应用迁移 + 连通性
pnpm db:deploy[:env]               # 数据库上线（唯一改结构入口）：增量应用未执行的迁移
pnpm release --env <环境> --check  # 代码上线前体检：配置 + 数据库迁移状态（只读）
pnpm release:test | release:prod   # 代码上线：构建 → 生产模式启动（不碰数据库）
pnpm release --env <环境> --build-only  # 体检 + 构建后停止（Linux 服务器配合 PM2，见 docs/spec/10-launch-runbook.md）
pnpm pm2:config                    # 生成 PM2 进程配置 ecosystem.config.json（含密钥不入库，ADR-041）
pnpm release:pm2:prod              # 服务器一条命令上线（PM2 形态）：体检+构建 → 生成 PM2 配置 → 重载 + save
                                   # = release --build-only && pm2:config && pm2 startOrReload --update-env && pm2 save
pnpm pack:deploy[:env]             # 本地打包自包含部署包 deploy/（免 git/pnpm/PM2，服务器 node start.mjs 一条命令，ADR-042）
pnpm build:sites --site <slug>     # 增量 SSG 构建指定站点
```

> 提示：`pnpm format` 已排除 `docs/` 与 `env/`（见 `.prettierignore`），文档不参与 Prettier 格式化。
> 提示：`pnpm allDev` 只启动进程（含端口释放），**不做任何数据库操作**；建库/迁移/种子始终由 `db:generate`、`db:migrate`、`db:seed` 独立完成。
> 提示：三条命令族不要混用——**开发** `allDev*`（源码直跑）、**代码上线** `release:*`（构建 + 生产模式启动，**绝不改数据库**）、**数据库上线** `db:deploy*`（唯一的改结构入口）。有结构变更时先 `db:deploy` 再 `release`（代码上线器会只读检查并在结构落后时拦下）；`allDev:prod` 只是"用生产环境文件跑开发形态"（本地联调用）。见 `docs/spec/07-deployment.md` §3.5 与 ADR-034。
> 提示：三端开发进程监听 `0.0.0.0`，就绪日志会额外打印「局域网访问」入口（本机 IP）；该清单若被后续日志顶掉会自动补打，并落盘到仓库根 `dev-endpoints.txt`（不入库），因此**工程完全启动后地址仍可见**。仅限内网可信环境使用（见 `docs/spec/08-adr.md` ADR-021）。
