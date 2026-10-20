# 多站点 CMS 平台 · 需求规格说明书

> **文档状态**：架构定稿（2026-10-05，历经 10 轮需求讨论收敛）
> **文档用途**：本项目唯一事实来源（Single Source of Truth）。任何 AI / 开发者**每次开发前必须先阅读本文档**，开发结论与本文档冲突时以本文档为准，需求变更必须先更新本文档再动代码。
> **配合文档**：
>
> - `AGENTS.md` —— AI 开发规范入口（术语、流程、命令）
> - **`docs/spec/INDEX.md` —— 架构与技术规格层（本文的下游）**：系统上下文、服务端/前端组件、数据模型、接口契约、发布与 GEO、部署、ADR 决策记录。本文只定义"做什么"，实现约束与部件职责在 `docs/spec/` 展开
> - `docs/PROJECT_STRUCTURE.md` —— 全局按目录分级说明每个文件用途，随开发持续维护
> - `docs/GLOSSARY.md` —— **术语表**：专有名词（slug / canonical / 产物清单 / 内容指纹 / 块标识 …）的统一解释口径；后台界面上的问号提示文案来源是 `apps/admin/app/config/glossary.ts`
>
> **文档层级**：本文（需求基线）→ `docs/spec/*`（架构规格）→ `PROJECT_STRUCTURE.md`（目录/文件级）→ 代码。架构级改动需先更新 `docs/spec/` 对应编号文档。

---

## 1. 项目定位

面向集团的多站点 CMS 内容平台：

- 一个平台管理 N 个企业站点（站点 = 企业，一对一）
- **核心商业目标：GEO（生成式引擎优化）驱动的获客与推流营销**——让集团内容更容易被 AI 搜索引擎（ChatGPT、Perplexity、文心等）抓取、理解、引用
- 传统 SEO 与 GEO 并重
- 后期支撑集团级内容营销矩阵

### 1.1 术语表（强制统一使用）

| 术语         | 指代                      | 目录          |
| ------------ | ------------------------- | ------------- |
| **GEO 项目** | 生成的站点 / 站点渲染引擎 | `apps/geo`    |
| **管理后台** | admin 管理端              | `apps/admin`  |
| **服务端**   | 数据层（NestJS + Prisma） | `apps/server` |

> 后续文档、代码注释、对话一律使用以上术语；GEO 项目的页面级项目规范 **TBD**（P1 启动时首先定义，P0 不涉及）。

## 2. 技术栈（定稿）

| 层       | 技术                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| Monorepo | pnpm workspace（根 package.json 只放 workspace 脚本）                           |
| 前端 ×2  | **Nuxt 4** + TypeScript；管理后台用 Element Plus + SCSS；GEO 项目为站点渲染引擎 |
| 后端     | NestJS + Prisma + **MySQL**（utf8mb4）+ TypeScript                              |
| 共享包   | `packages/shared`（内容模型类型、站点配置、Block 契约）                         |
| 规范     | ESLint + Prettier（配置见 §11）；**无 husky / lint-staged / commitlint**        |
| 部署     | Docker（compose 全套）+ 直接安装启动，双形态；基础说明放 README.md              |

## 3. Monorepo 结构

```
├── apps/
│   ├── admin/      # 管理后台（Nuxt 4，SPA 客户端渲染，登录态）
│   ├── geo/        # GEO 项目（站点渲染引擎，SSG/SSR 双模式）
│   └── server/     # 服务端（NestJS + Prisma 数据层 + 静态文件服务）
├── packages/shared/
├── docker/         # Dockerfile、compose、nginx 配置
├── docs/           # 本文档 + PROJECT_STRUCTURE.md
├── AGENTS.md
└── README.md
```

- **无每目录 README.md**（已明确否决）；目录/文件说明统一在 `docs/PROJECT_STRUCTURE.md` 一个全局文件里按目录分级维护
- 服务端旁 `uploads/` 目录存静态文件（P0 本地存储）

### 3.1 管理后台内部结构规范

- **所有 API 接口定义统一收口到 `app/config/api/` 目录，按业务模块拆分文件**（如 `api/auth.ts`、`api/sites.ts`、`api/files.ts`），禁止在页面/组件里硬编码接口 URL——统一入口、模块化拆分，二者缺一不可
- 配置化字段（字典、常量、枚举映射）统一放 `app/config/` 下；**菜单与角色不在前端配置**——菜单是后台数据（`Menu` 表，按角色授权过滤），角色名随 `/geoserver/auth/me` 返回，前端不维护角色枚举；侧栏由 `app/stores/menu.ts` 拉取后经 `app/components/SideMenuNode.vue` 递归渲染（最多三级）
- **目录内文件之间一律用 `~` 别名导入**（`import { sitesApi } from '~/config/api'`），不要用 `../../config/api` 这类相对路径。原因：Nuxt 4 的 `#app` 别名带尾斜杠，相对路径 `../../config/xxx` 会被 Nuxt 的 import-protection（impound）误判为引用 Nuxt 构建期模块而报 "This module cannot be imported in the Vue part of your app"（实测必现）

### 3.2 服务端内部结构规范

- 配置化内容统一放 `src/config/`（环境变量、数据库、上传、限流等配置 + zod 启动校验）
- **Prisma model 模块化**：schema 按 `prisma/schema/` 多文件组织（`site.prisma`、`static-file.prisma`、`admin-user.prisma`…，Prisma 6 起多文件 schema 已默认支持，无需 previewFeatures），不写单一大文件
- **数据库字段注释必须打全**：每个 model 用 `///` 注释说明用途、每个字段用 `///` 注释业务含义（注释会同步到生成的 client 类型与数据库 COMMENT）

### 3.3 共享包（packages/shared）

- 只放**类型契约**（站点、内容、Block、API 出入参），不放业务逻辑，供三个 app 共用，避免契约漂移
- 是**编译型包**：`pnpm build:shared` 产出 `packages/shared/dist`（`.js` + `.d.ts`）。服务端 `tsconfig.paths` 指向 `dist/index.d.ts`，因此**构建服务端前必须先构建 shared**（`pnpm build:server` 已内置该步骤）
- 服务端对 shared 只做 `import type`，运行期不会 require 它

## 4. 核心架构决策

### 4.1 双模式渲染引擎（GEO 项目）

- `sites.renderMode` 字段：`ssg | ssr`，**站点级开关，可随时切换，默认 `ssg`**（数据库默认值、服务端 `SITE_DEFAULTS`、后台表单默认值三处一致）
- 后台交互：**开关形式**（关 = SSG 静态构建 / 开 = SSR 服务端渲染）；**唯一入口是站点列表**（需平台级角色，切换前二次确认），站点编辑页不再出现该字段
- SSG 模式：手动发布 → 构建队列串行化 → **页面级增量 SSG**（变更页 + 级联：所在 Channel 列表页 + 站点首页 + sitemap）→ 产物写入 **`sites/<站点slug>/` 目录（public 同级，按站点名分类）** → 原子替换 → CDN / Nginx 纯静态托管
- SSR 模式：GEO 项目以 Node 服务运行，Nitro 中间件按 Host 解析站点 → 实时渲染，内容变更即时生效
- 两种模式共用同一套模板解析管线（页面 = 模板 + 数据），渲染结果一致，切换零迁移

### 4.2 页面 = 模板 + 结构化 Block

- 页面按模板方式渲染：`Page.templateId → Template（布局 + Block 槽位定义）`
- **Block 编辑器为结构化表单路线**（每个 Block 类型一个表单，非富文本自由编辑）——内容全部结构化，FAQ schema / llms.txt 摘要可全自动生成（GEO 能力上限保障）
- 三级模板体系：L1 渲染引擎（共享）→ L2 Block 组件库（平台维护）→ L3 站点模板包（`templates/<siteName>/`，组件 shadowing 覆盖，**每站点可自定义模板**）
- 新站点只用 L1+L2 时零代码

### 4.3 内容模型（P1 落地）

- 层级：`Site → Channel（目录/功能块，树形）→ Page → Block`
- 所有内容表挂 `siteId` 外键，**共库 + 行级隔离**（NestJS 中间件注入 siteId，Prisma 查询强制过滤，杜绝跨站泄漏）
- 状态流三态：`draft → pending_review → published`（站点管理员可审核，平台管理员可直发）
- 多语言：模型预留 `locale` 字段（Site/Channel/Page），v1 只做 zh-CN
- 内容含 GEO 字段：seo 元数据、summary 摘要、publishedAt/updatedAt、作者实体

### 4.4 鉴权（双 JWT 域）

| 域         | Token                 | 范围                                    |
| ---------- | --------------------- | --------------------------------------- |
| admin 用户 | JWT-A `/geoserver/**`（管理域）        | RBAC + 站点级数据权限                   |
| 站点会员   | JWT-M `/geoserver/site-auth/*`         | member 表挂 siteId，A 站会员在 B 站无效 |

- 权限分层：**平台级角色**管所有站点（含建站、renderMode、模板、实体、全局配置、用户/角色/菜单维护）；**站点级角色**仅授权站点的内容/会员/功能，无平台级操作——角色与菜单双绑定的界面控制（菜单是体验）+ Prisma siteId 强制过滤（**真正的安全边界**）**双保险**
- SSG 静态站的会员功能：静态壳 + 客户端动态 islands（`.client.vue` 组件调 member API）；公开内容必须直出 HTML 不被 islands 遮挡
- CORS 白名单按站点域名动态放行

### 4.5 发布管线

- 手动发布（保存只存草稿，点发布才触发构建）；整站批量重建按钮
- 构建队列串行化 + 构建日志 admin 可查 + 失败重试
- 产物按版本留档可回滚（目录原子替换）
- SSR 站点无构建环节，内容即时生效

## 5. 数据模型（P0 已设计）

### 5.0 数据库约定（本地开发环境）

| 项              | 值                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------- |
| Host / Port     | 127.0.0.1 / 3306                                                                          |
| User / Password | root / 111                                                                                |
| 数据库名        | `trillionCms`                                                                             |
| 字符集          | utf8mb4 / utf8mb4_unicode_ci                                                              |
| 时区            | **Asia/Shanghai（UTC+8）**：Node `TZ=Asia/Shanghai`、MySQL `default-time-zone=+08:00`     |
| 时间格式        | `2026-10-05 10:10:10`（秒精度）——Prisma 字段统一 `DateTime @db.DateTime(0)`，禁用毫秒尾数 |

**时间口径（已实测确认，务必遵守）**

- MySQL 会话时区为 `+08:00`，`NOW()` 返回北京时间。
- Prisma 对 MySQL `DATETIME` 一律按 **UTC** 读写（落库值是 UTC 瞬间，这是 Prisma 的标准行为，不要试图改成墙钟时间，会破坏往返一致性）。
- 因此**对外输出统一按中国时区格式化**：`apps/server/src/common/utils/datetime.ts` 提供 `formatDateTime`，并在 `main.ts` 覆盖 `Date.prototype.toJSON`，使所有接口返回的日期串为 `2026-10-05 18:35:40` 形式（北京时间）。
- 直接用 `toISOString()` 会导致早 8 小时，属明确禁止的写法。

建库语句：`CREATE DATABASE IF NOT EXISTS trillionCms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

### 5.1 sites 表（站点 = 企业，一张表）

**企业主体**：company_name（企业名称/执照全称）、credit_code（统一社会信用代码）、business_license_file_id（→static_files 营业执照图片，仅后台存档不对外展示）、company_address、contact_phone、contact_email

**网站信息**：name（网站名称）、slug（站点标识=产物目录名，唯一；同时作为列表「预览」的站点前缀，编辑页可改）、domain（**主域名**：生产填正式域名，本地开发填本地地址如 `localhost:3002`；后台列表「预览」= 主域名 + 站点前缀 slug，SEO 绝对 URL（sitemap/llms.txt/JSON-LD）用主域名）、icp_number（ICP 备案号，自动渲染页脚）、police_number（公安备案号，可空）

**域名映射（多域名）**：一个站点可被多个域名访问，其中 `domain` 为**主域名**（唯一），别名域名存 `site_domains` 表（site_id + domain 唯一），如 `www.` 前缀、不同后缀（`.com`/`.cn`）、历史域名与备案备用域名；别名域名**全局唯一**（不与任何站点的主/别名域名重复），仅参与 GEO 项目按请求 Host 反查站点，页面内容与元数据与主域名一致（主域名仍是规范地址）

**SEO/GEO 默认值**：seo_title、seo_description、seo_keywords、logo_file_id、favicon_file_id、default_locale（预留，v1 固定 zh-CN）、robots_policy（json，AI 爬虫策略，默认全放行）

**平台配置**：render_mode（ssg/ssr）、theme_config（json 主题令牌）、status（active/disabled）、created_at、updated_at

### 5.2 static_files 表（静态文件 URL 表）

id、site_id、original_name（原始文件名）、storage_path（`uploads/2026/10/{uuid}.webp`）、public_url（`/static/2026/10/{uuid}.webp`）、mime_type、size_bytes、width/height（可空）、uploaded_by（→admin_users）、created_at

- **URL 与物理存储解耦**：业务表只存 file_id 引用，URL 由服务端统一生成；将来切对象存储只改 URL 规则 + 迁移脚本，业务零改动
- P0 物理存储：server 旁 `uploads/` 文件夹；开发环境 server 服务 `/static/**`，生产 nginx 直接映射
- 上传安全：类型/大小校验；图片管线：压缩、多尺寸、WebP 转换（影响 Core Web Vitals → GEO）
- **原位替换（2026-10-14）**：`PUT /files/:id/replace` 保持记录与 `publicUrl` 不变、仅覆盖物理文件（新文件 MIME 必须与原记录一致）——站点里已引用的地址不用改、无需重发站点，替换即全站生效（素材管理页「替换」入口）

### 5.3 admin 站点管理页面形态

- **列表页**：密集表格（网站名称/企业名称/**域名映射**/站点前缀/ICP 备案号/状态/操作），搜索 + 状态筛选 + 新建按钮 + 分页；网站名称为纯文本（不可点击），**域名映射列展示主域名 + 别名域名数量**（tooltip 展开全部别名），搜索关键字同时匹配主域名与别名域名；**站点前缀列**展示站点标识 `slug`（编辑页可改，同时是 SSG 产物目录名）；渲染模式列与模式筛选本期隐藏（纯 SSG，后台暂不暴露该入口），操作列提供「预览」（新标签页打开**主域名 + 站点前缀**访问地址——本地多站点共用 `localhost:3002` 时据此前缀区分目标站点，避免预览总落到同一站点）与「编辑」（进入深入编辑页）
- **编辑页**：列表右侧操作列"编辑"进入**独立深入编辑页**（非弹窗），**单页三分区、无 Tab 切换**：基本信息（含**主域名 + 别名域名映射**、站点状态）/ 企业资质 / SEO 设置；别名域名以可增删的输入行维护（保存时全量提交，重复/冲突由服务端校验拦截）；站点前缀 `slug` 在基本信息区可改（标签同时说明其作为列表「预览」地址前缀的用途）；渲染模式与站点主题色不在编辑页出现（渲染模式本期暂不在后台暴露，主题色由服务端默认值兜底）

### 5.4 新闻资讯 / 高频问答后台管理（2026-10-14；2026-10-15 改表驱动）

- 「站点管理」目录型菜单下有**新闻资讯**（/sites/news）与**高频问答**（/sites/faqs）两个管理页；服务端 `news-faq` 模块提供 CRUD。**数据落独立表 `NewsArticle` / `FaqItem`（唯一管理源，见 [`spec/04`](./spec/04-data-model.md) §8）**：接口按表记录 `id` 寻址，详情直读表、**不收 `siteId` 参数**（按记录自身 `siteId` 归属鉴权，见 [`spec/05`](./spec/05-api-contract.md) §3.13）；`Page`（`kind=detail`，`/news/*` 与 `/faq/q{三位序号}`）是**发布产物**——表记录持 `pageId` 弱引用、页面缺失保存自动补建；`slug` 创建后不可改
- **保存即同步发布页面**：每次增删改自动重算派生块（/news、/faq 列表页与同分类详情页 related-faq）并自动触发**页面级**发布（系统入口入队）；表记录 `status` 恒为 `published`（免审核，与站点编辑器保存行为一致）
- **新闻发布日期必填且不可早于今天**（`YYYY-MM-DD`，服务端中国时区 `todayInChina()` 强校验 + 管理端弹窗禁选过去日期）；问答无发布日期字段
- 新闻去分类（`post-list` / `article-meta` 无分类字段，列表分页由 `post-list` 客户端分页承担）；问答按分类组织（分类筛选、分类清单接口、换分类时新旧分类均重算）
- 正文 / 答案编辑用 wangEditor 纯文本封装（`PlainTextEditor`，v-model 只出纯文本、按换行拆段落块）；发布链路见 [`spec/06`](./spec/06-publish-and-geo.md) §8，决策见 ADR-039

## 6. GEO 能力清单（核心需求，四层落地）

**L1 数据模型层**：Page 的 seo/summary/时间/作者实体字段；Entity 表（集团品牌/产品/别名统一管理，实体一致性）；内置 FAQ 问答 Block 类型

**L2 模板渲染层**：**语义化 HTML（强制执行）**——页面骨架、唯一 H1、层级不跳级、文本/时间/联系信息/图文/表单的语义标签（含 `alt` / `label` / `datetime`），完整清单见 [`spec/03-frontend-architecture.md`](./spec/03-frontend-architecture.md) §4；内容直出 HTML 源码（公开内容不得依赖客户端渲染）；Core Web Vitals 保障（静态化+CDN、首屏预加载、图片规范）

**L3 构建产物层**（发布时自动生成）：

- llms.txt / llms-full.txt（LLM 专用内容索引）
- sitemap.xml、robots.txt（**默认放行 AI 爬虫**：GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、PerplexityBot、Google-Extended、Bytespider 等，站点级可配置屏蔽）
- 每页 JSON-LD（Organization/WebSite/Article/BreadcrumbList/FAQPage/Product）
- 发布前 GEO 检查清单自动校验（缺 title/H1/摘要 → 警告或阻断）

**L4 监测运营层**：AI 引荐流量归因（referer 区分 AI 来源）；品牌提及检测（定期问主流 LLM，后置）；URL 稳定 + 改 slug 自动 301

**内容质量要求**：FAQ 直接回答型结构；事实密度（统计、来源、日期）；E-E-A-T 署名（作者实体+资质）；摘要字段强制；内容新鲜度标注

## 7. 监控体系（v1 从简）

- **埋点**：GEO 项目全局注入 analytics 插件（router.afterEach），`navigator.sendBeacon` 上报 `{siteId, path, referrer, anonId}`（匿名 ID 本地生成，无个人信息）；`POST /geoserver/track/collect` 限流 + 站点 CORS；内存队列攒批写入
- **表**：track_event（siteId/path/referrer/ua/anonId/createdAt）、ai_crawl_event（botType/siteId/path/status/bytes/createdAt）
- **AI 爬虫监控**：UA 清单可配置表；自托管模式 nginx access log 采集器过滤 AI UA → 摄取入表；llms.txt 由 server 动态返回顺便记录抓取；CDN 模式 v1 不覆盖（预留日志源适配器）
- **admin 看板**：路由 PV/UV 趋势、Top 页面、referrer、AI 抓取量/路径 Top；站点管理员仅本站数据
- **约束**：SSG 站点埋点要求 server 可公网访问（部署文档注明）

## 8. UI 设计规范（admin）

- **当前方案 A2「亮色控制台」**（2026-10-06 起，取代原暗色方案）：页面底色 #F4F6FB、面板 #FFFFFF、边框 #D8DFEC、主色 #2563EB、数据高亮 #0E7490、成功 #15803D、警告 #B45309、危险 #DC2626；主文本 #1F2A44 / 次级 #48557A / 弱化 #7B87A3；表头 #F7F9FC
- **状态文本统一走语义色工具类**（`.c-success` / `.c-warning` / `.c-danger` / `.c-primary` / `.c-mute`，定义在 `main.scss`），**禁止页面内写死色值**
- **颜色唯一来源（硬规范）**：后台主题色只在 `app/assets/scss/tokens.scss` 定义（主色 light/dark 梯度由 `color.mix()` 自动派生，**禁止全局 `mix()`**——它已被 Dart Sass 弃用，dev/build 会输出 DEPRECATION WARNING 且 Dart Sass 3.0 将移除）；站点主题默认值只在 `app/config/site-defaults.ts`（与后端 `SITE_DEFAULTS.theme` 对齐）；**TS / Vue 中的颜色字面量由 ESLint `no-restricted-syntax` 直接拦截**，防止主题色散落回页面
- **一屏内滚动（硬规范）**：页面主功能区（布局的 `.content`）固定在一屏内，内容溢出时**只在主功能区内部出现滚动条**，不允许浏览器级整页滚动；实现要点：`.main { min-height: 0; overflow: hidden }` + `html, body { overflow: hidden }`
- **间距档位（硬规范）**：页面容器 padding/gap、筛选栏 gap、面板标题 padding 统一 `$sp-1`（8px）；只有确需更大间隔才用 `$sp-2`（16px），禁止临时写像素值。目标是单屏展示更多内容
- **Element Plus 尺寸基准**：全局 `size: 'small'`（插件级统一设置），后台"12px 字号 + 紧凑密度"规范与 EP small 档相互印证；组件无需逐个声明 size
- **分页规范（硬规范）**：所有列表默认每页 **20** 条，档位 **[10, 20, 30, 50, 100]**；前端配置 `app/config/pagination.ts`、服务端常量 `src/common/constants.ts` 两处对齐（服务端对越界 pageSize 回退默认值）；所有列表页必须提供"每页条数"选择
- **按钮防抖 + loading（硬规范，两个独立概念）**：统一收口在 `app/utils/tool.ts`，**不得混淆、不得自写**
  - **防抖（时间维度）**：`debounce(fn, DEBOUNCE_WAIT)` —— 决定"这次调用要不要放行"，只管时间窗口；默认 `leading: true`（**先触发后防抖**：首次立即执行，窗口内默认 400ms 的重复调用被过滤，`trailing` 可选补执行）；另有 `throttle` 供"窗口内最多一次"的场景
  - **loading（状态维度）**：`useLoading()` —— 只管"执行中"的标记与互斥：`run(fn)`（整块，执行中重复进入被忽略）、`runKeyed(key, fn)`（列表行级）、`isLoading(key?)`（绑按钮 `loading`）
  - **写操作按钮统一写法：防抖在外、loading 在内** —— `const onSave = debounce(() => run(async () => { ... }), DEBOUNCE_WAIT)`；列表行内按钮 `debounce((row) => runKeyed(\`remove:${row.id}\`, fn), DEBOUNCE_WAIT)` + `:loading="isLoading(\`remove:${row.id}\`)"`。目的：避免误触造成重复提交、重复建站、重复触发构建等数据问题
- **操作按钮文案与语义色（硬规范）**：统一走 `el-button link size="small"`（含跳转动作，用 `navigateTo`；不与 `NuxtLink` 混用，避免相邻间距与颜色漂移）
  - **文案词典（禁止同义混写）**：新建（不用"新增/添加"）· 编辑（不用"修改/查看"）· 删除（不用"删/移除"）· 保存（表单提交统一用"保存"，不用"确定/提交/更新"）· 提交审核（不用"提交"）· 发布 · 刷新 · 上传 · 取消（弹窗关闭）· 返回（页面回列表，不用"取消"）
  - **语义色（由设计令牌派生，禁止页面写死色值）**：**主操作 `primary`**（新建 / 编辑 / 保存 / 详情）· **正向流转 `success`**（发布 / 提交审核 / 启用）· **破坏性 `danger`**（删除 / 停用 / 清空）· **中性辅助默认色**（预览 / 刷新 / 菜单授权 / 加子菜单 / 上传）
  - **顺序固定**：预览 → 编辑 → 流转动作 → 删除（危险动作永远放最后）；操作列 `fixed="right"`
- **设计令牌（硬规范）**：`$font-size-base: 12px`；`$spacing-unit: 8px`（8/16/24/32 组合）；**信息密度优先**（compact 表格/表单/菜单，单屏多面板多行表格，拒绝空洞大留白）
- 数字一律等宽字体（mono）
- **表格规范（硬规范）**：所有数据表格统一 `el-table` + `border`（列宽可自由拖拽）；禁止手写 `<table>` 实现数据表格；border 表格所在面板不再叠加边框（外框由表格承担）
- **语义化豁免（硬规范）**：管理后台是 SPA 内部工具，**不要求 HTML 语义化**（无 SEO / 爬虫 / SSG 诉求），统一用 Element Plus 组件与布局 `div` 即可，**不得为"语义正确"额外重构后台结构**；语义化要求仅作用于 GEO 项目及其 Block 组件（见 §6 L2 与 [`spec/03`](./spec/03-frontend-architecture.md) §4）
- **弹窗规范（硬规范）**：所有弹窗（不论大小）一律抽为 `app/components/*Dialog.vue` 独立组件，页面只保留 `v-model` 显隐开关与 `@saved` 刷新回调，页面内不得内联 dialog 内容
- Element Plus 定制**亮色**主题（CSS 变量 `--el-*` 覆盖，见 `main.scss`），作为 admin 基础设施先落地
- **主题边界**：本节仅约束管理后台；GEO 站点的外观由站点 `themeConfig` 驱动（一套代码多站点），与后台主题互不影响
- 已废弃方案存档：A1「深空控制台」（暗色，2026-10-05 ~ 10-06，用户反馈过暗）、B 极客终端（黑底荧光绿 TUI）、C 冷白数据舱（浅色金融终端风）——不再使用除非用户重新提出

## 9. 权限与角色（RBAC：用户 → 角色 → 菜单）

- 权限模型是**三层绑定**：用户绑定角色（`AdminUser.roleId`）· 角色授权菜单（`RoleMenu`）
- 角色属性：`code`（唯一标识）、`name`、`description`、`platform`（**是否平台级**）、`builtin`（内置保护）、`status`、`sort`
- **平台级角色**：站点增删、renderMode、模板管理、Entity 管理、全局配置、用户/角色/菜单维护、可直发内容
- **站点级角色**：仅授权站点的内容/会员/功能，三态流中可审核 `pending_review`
- 初始内置角色：`admin`（系统管理员，平台级）与 `site_admin`（站点管理员，站点级）；初始账号 `admin` 绑定 `admin` 角色
- 菜单可见性**唯一来源是角色授权**；角色信息随 JWT-A 下发（`roleId/roleCode/roleName/platform`），角色变更需该用户重新登录生效
- 界面隐藏只是体验层，接口鉴权（`PlatformAdminGuard` / `siteScope`）才是安全边界

**系统设置下的三个管理页（均限平台级角色）**：

- **用户管理**（`/settings/users`）：账号增删改查、分配角色、站点授权、启停；账号不可改；不能删除自己；系统必须保留至少一个可用平台级用户
- **角色管理**（`/settings/roles`）：角色增删改查 + 菜单授权树；内置角色不可删除 / 不可停用 / 不可改标识；仍有用户绑定的角色不可删除；授权保存时自动补全上级菜单
- **菜单管理**（`/settings/menus`）：三级菜单 `名称 / 路由路径 / 上级菜单 / 排序 / 侧栏可见 / 状态`；目录型菜单可只做分组（路径留空）
- 侧栏由 `/geoserver/menus/tree` 按当前用户角色的授权动态渲染，保存后即时生效，无需重新构建
- 服务端强制约束：菜单最多三级（挂载超出直接 `400`）、禁止父级指向自身或自己的后代、存在子菜单时拒绝删除

## 10. 部署

| 形态   | admin               | web 产物                                                   | server          | MySQL      |
| ------ | ------------------- | ---------------------------------------------------------- | --------------- | ---------- |
| Docker | node 镜像多阶段构建 | GEO 项目：SSG 产物 nginx 镜像/对象存储；SSR 站点 node 运行 | node 镜像       | mysql 镜像 |
| 直装   | pnpm dev:admin      | pnpm build:sites（SSG）/ pnpm dev:geo（SSR）               | pnpm dev:server | 本地 MySQL |

- docker-compose 一键全套；README.md 写清两种方式完整步骤
- **服务前缀（2026-10-15 起）**：服务端接口全局前缀 **`/geoserver`**（Swagger `/geoserver/docs`），管理后台挂 **`/geocms/`** 基础路径；`apiBase` 为**绝对基址**（缺省 `http://<PUBLIC_HOST>:<PORT_SERVER>/geoserver`），反向代理按前缀分流；决策见 ADR-040
- 备份：MySQL 定时备份 + sites/ 产物备份脚本
- server 日志：pino 结构化日志 + 错误分级；/health 健康检查

## 11. 工程规范

- ESLint：admin 用 @nuxt/eslint（flat config），server 用 typescript-eslint；各自 eslint.config，根 package.json 聚合脚本
- Prettier 配置（定稿，用户给定）：

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 120,
  "tabWidth": 2,
  "useTabs": false,
  "trailingComma": "none",
  "arrowParens": "always",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "singleAttributePerLine": false,
  "quoteProps": "as-needed",
  "vueIndentScriptAndStyle": false,
  "htmlWhitespaceSensitivity": "css",
  "embeddedLanguageFormatting": "auto",
  "proseWrap": "preserve",
  "endOfLine": "auto"
}
```

- .editorconfig、.gitignore、`.prettierignore`（`docs/` 与 `env/` 不参与 Prettier 格式化）
- **全局配置三层分工**（2026-10-06 起）：根 `env/`（各环境的变量值，`env/.env.production` 不进 git + `env/.env.example` 模板）→ 根 `config/`（端口表 `ports.mjs`、应用清单 `apps.mjs`、派生逻辑 `index.mjs`）→ 应用（只读注入变量，**不再自带 `.env`、不再保留端口/数据库默认值**）
- **根 scripts/**：`dev.mjs`（`pnpm allDev` 一键启动三端，开发形态：源码直跑，先结束占用端口的旧进程）、`release.mjs`（`pnpm release:test|prod` **代码上线**：体检 → 构建 → 生产模式启动，不碰数据库）、`db-release.mjs`（`pnpm db:deploy*` / `db:status*` **数据库上线**：体检 → `migrate deploy` → 复核，唯一的改结构入口）、`port-guard.mjs`（端口查询/结束/释放，两个启动器共用）、`exec.mjs`（开发向 `db:*` / `build:*` 以同一套配置执行）、`pnpm.mjs`（pnpm 调用封装），零第三方依赖
- 全局 config 模块：@nestjs/config + **zod 启动校验**（缺配置直接报错，变量的值来自根 `env/`）
- NestJS：统一响应结构（TransformInterceptor `{code, message, data}`）+ 全局异常过滤器 + @nestjs/swagger（**生产环境关闭**）+ 健康模块
- 安全基线：登录限流防爆破、密码 bcrypt/argon2、上传类型/大小校验、XSS 净化（结构化 Block 场景下风险已降低，富文本字段仍需）、时区统一约定

## 12. 文档与 AI 协作规范

- `AGENTS.md`（根）：AI 开发规范入口——技术栈、命令、禁区、**先阅读后开发**流程
- `docs/spec/`：**架构与技术规格层**（编号体系 `INDEX` + `00`~`09`），承载系统上下文、服务端/前端组件、数据模型、接口契约、发布与 GEO、部署、**ADR 决策记录**。本文定义"做什么"，该层定义"怎么设计"，**架构级改动必须先更新对应编号文档再动代码**（维护契约见 `docs/spec/INDEX.md` §4）
- `docs/PROJECT_STRUCTURE.md`：**一个全局文件**，按目录树分级，目录说明职责、文件说明用途；**每次新增/删除/修改文件用途后必须同步更新对应条目**
- 阅读顺序：AGENTS.md → 本 REQUIREMENTS.md → `docs/spec/INDEX.md`（按角色选读编号文档）→ PROJECT_STRUCTURE.md → 涉及目录的代码

## 13. 实施分期

| 期     | 范围                                                                                                                                                  | 交付                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **P0** | Monorepo 骨架 + sites/static_files 两表 + uploads 静态服务 + admin 登录（JWT-A）+ 站点列表/深入编辑页 + 暗色主题基建                                  | 能建站、传文件、管理企业信息 |
| **P1** | Channel/Page/Block 内容模型 + 三态流 + 模板渲染 + SSG 增量发布 + GEO 基础产物（sitemap/robots/llms.txt/JSON-LD/发布校验）+ **GEO 项目页面级规范定义** | 站点真正发布上线             |
| **P2** | 站点会员体系（JWT-M + islands）+ 埋点 + AI 爬虫监控 + SSR 模式 + Entity 表                                                                            | 完整平台                     |

**Backlog（明确后置）**：页面版本历史与回滚、定时发布、站点前台搜索（静态索引）、CI/CD、GEO 引用检测自动化、E2E 测试、对象存储切换

## 13.5 首次全量构建验证（第 14 轮，已跑通）

| 环节        | 命令                                      | 结果                                                                                                                                             |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 依赖安装    | `pnpm install`                            | ✅ 1071 包（pnpm 12 默认拦截依赖构建脚本，`.npmrc` 已设 `strictDepBuilds=false`，`pnpm-workspace.yaml` 的 `allowBuilds` 放行 esbuild/prisma 等） |
| 建库 + 迁移 | `pnpm db:migrate`                         | ✅ 自动创建 `trillionCms` 并应用 `20261005103528_init`                                                                                           |
| 种子数据    | `pnpm db:seed`                            | ✅ admin/admin123456、3 个模板、示例站点 star-tech（含首页 + 资讯页）                                                                            |
| 服务端      | `pnpm build:server` + `node dist/main.js` | ✅ 43 条路由，`/geoserver/**` + Swagger `/geoserver/docs`                                                                                        |
| 管理后台    | `pnpm build:admin`                        | ✅ Nuxt 4 构建通过（SPA 客户端渲染）                                                                                                             |
| GEO 项目    | `pnpm build:geo`                          | ✅ 双模式引擎构建通过                                                                                                                            |
| 站点 SSG    | `pnpm build:sites --site star-tech`       | ✅ 产出 `apps/geo/sites/star-tech/`（index.html、news/ai-trend、robots.txt、sitemap.xml、llms.txt）                                              |

**环境提示**：若所在环境禁止创建符号链接导致 `pnpm install` 后 `node_modules` 为空，可改用 `pnpm install --node-linker=hoisted`（本机验证有效），普通环境不需要。

## 14. 已明确否决事项（防幻觉专区——不得擅自加入）

1. ❌ **husky / lint-staged / commitlint**——用户明确不要提交限制
2. ❌ **changelog.md**——用户嫌麻烦，不要
3. ❌ **每目录 README.md**——用户明确拒绝，统一到 PROJECT_STRUCTURE.md 一个文件
4. ❌ **Element UI**——不兼容 Vue 3，已定 Element Plus
5. ❌ **Nuxt 3 / Nuxt 2**——已定 **Nuxt 4**
6. ❌ **站点永久纯静态 SSG**——SSG/SSR 是站点级开关，非永久形态
7. ❌ **富文本自由编辑 Block**——已定结构化表单 Block
8. ❌ **npm / yarn workspace**——已定 pnpm
9. ❌ **纯 JavaScript**——已定全 TypeScript
10. ❌ v1 做多语言内容 / CI —— 均为预留或后置；~~版本回滚~~ 已于 2026-10-06 解禁为**「只保留上一版」回退**（见 [`spec/08-adr.md`](./spec/08-adr.md) ADR-026），N 版历史仍后置
11. ❌ **MCP / agent 相关能力**——2026-10-06 明确否决，不做任何"预留 MCP 底座"的设计与表述
12. ❌ **块级发布**——SSG 产物最小粒度是页面 HTML，发布粒度固定为「单页 / 整站」（见 ADR-026）
13. ❌ **可视化富文本编辑块内容**——块可在线编辑**代码**（Vue SFC），但不提供可视化内容编辑（见 ADR-023）
14. ❌ **发布后修改页面访问地址（含自动 301）**——URL 一经发布不可变（见 ADR-025）
15. ❌ **"页面树即站点导航"**——导航是独立配置数据，内容树仅用于后台可视化管理（见 ADR-029）

## 15. 需求演进记录

| 轮次 | 时间  | 要点                                                                                                                                                                                                                                                                                                       |
| ---- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 16:26 | 初版：Nuxt+ElementUI+NestJS+Prisma+MySQL+多项目+eslint/prettier                                                                                                                                                                                                                                            |
| 2    | 16:30 | 修正：Nuxt 4、去 husky、去 changelog、去每目录 README                                                                                                                                                                                                                                                      |
| 3    | 16:33 | 文档体系改为 docs 下全局 md 按目录分级；仍构思阶段                                                                                                                                                                                                                                                         |
| 4    | 16:40 | 定位升级：多站点 CMS 平台、admin/web 分离、SSG 产物按站点目录、CDN、Docker+直装                                                                                                                                                                                                                            |
| 5    | 16:45 | 决策：每站点可自定义模板、手动发布、本地 uploads、站点会员体系                                                                                                                                                                                                                                             |
| 6    | 16:52 | 站点级 SSG/SSR 开关、页面模板化渲染、两级权限、GEO 为核心需求                                                                                                                                                                                                                                              |
| 7    | 16:57 | admin 埋点监控（路由 PV/UV）+ AI 爬虫监控（v1 从简）                                                                                                                                                                                                                                                       |
| 8    | 17:01 | UI 三方案，选定深空控制台；设计令牌 12px/8px/密度优先                                                                                                                                                                                                                                                      |
| 9    | 17:08 | 多语言预留、三态流、版本回滚后置、结构化 Block                                                                                                                                                                                                                                                             |
| 10   | 17:16 | 简化分期 P0/P1/P2；sites 表（企业元数据）+ static_files 表设计；站点列表→深入编辑页                                                                                                                                                                                                                        |
| 11   | 17:20 | 全部需求固化为 docs/REQUIREMENTS.md（唯一事实来源 + 否决专区）                                                                                                                                                                                                                                             |
| 12   | 17:26 | 术语统一（GEO 项目/管理后台/服务端）；管理后台接口统一收口 config/api 模块化拆分；服务端 config 统一 + Prisma model 模块化 + 字段注释必打；GEO 项目页面规范 TBD（P1 定义）                                                                                                                                 |
| 13   | 17:39 | 数据库确认：127.0.0.1:3306 root/111、库名 trillionCms、中国时区、`2026-10-05 10:10:10` 秒精度格式                                                                                                                                                                                                          |
| 14   | 19:30 | **全量构建并跑通验证**（P0+P1+P2 骨架）：prisma migrate/seed 成功、服务端 43 路由启动、admin 与 geo 构建通过、示例站点 `star-tech` SSG 产物（index/news/robots/sitemap/llms）生成。修复清单见 §16                                                                                                          |
| 15   | 10-06 | **架构文件输出为 `docs/spec/` 规范层**（项目迁移至 `D:\g\个人项目\trillion-cms-platform`）：新增 `INDEX` + `00`~`08` 共 10 篇（系统上下文/服务端/前端/数据模型/接口契约/发布与 GEO/部署/ADR 15 条）；AGENTS、README、REQUIREMENTS、PROJECT_STRUCTURE 四方交叉引用，形成"需求→架构→文件级→代码"四级文档体系 |
| 16   | 10-06 | **全局配置集中 + 一键启动**：新增根 `env/`（development/test/production 三套变量，生产文件不入库）与根 `config/`（端口唯一事实来源、应用清单、API 基址 / CORS / `DATABASE_URL` 派生）；新增根 `scripts/`（`pnpm allDev` 启动器：先结束占用端口的旧工程再并发启动，Ctrl+C 全部回收；`exec.mjs` 为 `db:*` / `build:*` 注入同一套配置）；三工程删除自带 `.env` 与端口/数据库默认值；`docs/` 退出 Prettier；`PROJECT_STRUCTURE.md` 改为逐文件可点击链接 |
| 17   | 10-06 | **后台菜单数据驱动 + 菜单管理**：菜单从 `app/config/menu.ts` 硬编码改为后台配置（新增 `Menu` 表 / `menus` 模块 / `/api/menus/tree`），侧栏改为递归渲染（最多三级）；新增「系统设置 → 菜单管理」页（平台级，可维护名称/路径/上级/排序/可见/平台级/状态）；同步修复总览仪表盘与 GEO 监控页进度条与筛选栏同名 `.bar` 导致的蓝色横线；决策见 ADR-018 |
| 18   | 10-06 | **RBAC：用户 → 角色 → 菜单**：新增 `Role` / `RoleMenu` 表，`AdminUser.role` 字符串改为 `roleId` 外键绑定角色；删除 `Menu.platformOnly`，菜单可见性唯一来源改为角色授权（保存授权自动补全上级）；`PlatformAdminGuard` 判据改为角色的 `platform` 标记；新增「系统设置 → 用户管理 / 角色管理」两页（用户分配角色与站点授权、角色 CRUD 与菜单授权树）；内置角色 `admin`（平台级）/`site_admin`，初始 `admin` 账号绑定 `admin` 角色；安全护栏：内置角色不可删/停用/改标识、不能删自己、必须保留至少一个可用平台级用户；决策见 ADR-019 |
| 19   | 10-06 | **站点列表增加预览 + 访问地址本地化**：站点管理列表的网站名称改为纯文本（不再点击即编辑），操作列新增「预览」——新标签页打开站点访问地址；`Site.domain` 语义明确为**站点访问地址**（域名或 `host:port`），清理遗留示例域名 `star-tech.example.com` 并改为本地地址 `localhost:3002`，站点编辑页给出本地填写提示 |
| 20   | 10-06 | **渲染模式改为开关**：站点列表「渲染模式」列由文本改为开关（关 = SSG / 开 = SSR），可原地切换（仅平台级角色、切换前二次确认，提交后刷新列表）；站点编辑页同字段由下拉改为同一开关并带模式说明；明确 `renderMode` 默认 `ssg`（数据库默认值 / 服务端默认值 / 后台表单默认值三处一致） |
| 21   | 10-06 | **表格与弹窗规范化**：全部 11 处手写 `<table>` 改为 Element Plus `el-table` + **`border`**（border 模式下可自由拖拽列宽，样式基线统一在 `main.scss`：紧凑密度、暗色网格线、拖拽指示线）；border 表格所在面板不再叠加边框；5 个内联 `el-dialog` 全部抽为独立组件（`MemberCreateDialog` / `MenuFormDialog` / `RoleFormDialog` / `RoleMenusDialog` / `AdminUserFormDialog`，`defineModel` 控制显隐 + `@saved` 刷新）并写入强制规范；顺带把爬虫 Top 的 div 循环列表改为语义化 `ul/li` |
| 22   | 10-06 | **语义化规范分区落地**：明确 **`apps/admin` 不要求 HTML 语义化**（SPA 内部工具，禁止为语义重构后台）；**`apps/geo` 及其全部 Block 组件必须严格遵循 HTML5 语义化规范**（含管理后台所管理站点的 Block 产物），完整清单写入 [`spec/03`](./spec/03-frontend-architecture.md) §4（骨架/标题层级/文本/图文/表单/结构化数据 + 自查清单）；同步修正 GEO 侧问题：`BlockHero` 的 `h1` 降为 `h2`（消除一页多 h1）、`PageRender` 发布时间改用 `<time datetime>`、`BlockContact` 改用 `address` + `dl/dt/dd` + `tel:`/`mailto:`、`BlockImageList` 改用 `figure`/`figcaption`、`BlockText`/`BlockHero` 标题防空标签、`MemberBadge` 登录表单补 `label` 与 `autocomplete`、页脚备案改用 `<small>`；同时在核查中发现并修复两处**静默失效**缺陷——`app.vue` 补 `<NuxtLayout>`（否则 `definePageMeta({ layout })` 失效，站点页头/页脚与 `<main>` 全不渲染）、`nuxt.config.ts` 组件自动导入关闭 `pathPrefix`（否则 `components/blocks/BlockXxx.vue` 注册名带目录前缀，`<BlockRenderer />` 解析失败导致**页面正文 Block 全部不渲染**，仅打印一条 Vue warn、构建不报错）。修复后实测站点 HTML：`h1` 唯一、`h2`×4 / `h3`×2、`main`×1、`address`/`dl`/`small`/`time` 齐备 |
| 23   | 10-06 | **管理后台主题改亮色**：用户反馈暗色过暗，管理后台整体切换亮色主题（底色 `#F4F6FB` / 面板 `#FFFFFF` / 边框 `#D8DFEC` / 主色 `#2563EB` / 文本 `#1F2A44`，状态色改为亮底可读的深色系）；新增 `$c-table-head`、`$c-input` 令牌与 `.c-*` 语义色工具类，并清理页面内全部写死色值（表头、输入框底色、菜单与 Tab 选中态、状态文本、GEO 分档、体检标签、发布任务状态字典）；**仅作用于 `apps/admin`**——GEO 站点外观由站点 `themeConfig` 驱动，本次未改动 GEO 侧任何颜色；决策见 ADR-020（取代 ADR-014 的配色部分，字号/间距/密度规范继续有效） |
| 24   | 10-06 | **主题色全局统一（消除散落硬编码）**：① 状态字典 `STATUS_META` / `TASK_STATUS_META` 由 `{ color }` 改为 `{ className }`（只给 `.c-*` 语义类名，页面统一 `:class`）；② `tokens.scss` 新增 `$c-on-primary`、`$c-mask` 令牌，Element Plus 主色 light-3~9 / dark-2 梯度改为 `mix()` 从 `$c-primary` 派生（换主色只改一处）；③ 站点主题默认值从 `sites/[id].vue` 内联抽到 `app/config/site-defaults.ts`（与服务端 `SITE_DEFAULTS.theme` 对齐）；④ 新增 ESLint `no-restricted-syntax` 规则**拦截 TS/Vue 中的颜色字面量**（含模板表达式，`site-defaults.ts` 为唯一豁免、已实测可拦截）。至此后台颜色唯一来源＝`tokens.scss` + `.c-*` 语义类 |
| 25   | 10-06 | **页面密度与分页规范化**：① **一屏内滚动**——`html/body` 禁整页滚动，`.main` 加 `min-height: 0; overflow: hidden`（修掉 flex 撑开导致的浏览器级滚动条），滚动只发生在 `.content` 内；② **间距收紧**——页面容器 padding/gap、筛选栏 gap、面板标题 padding 统一 `$sp-1`（8px），主内容区与顶栏 padding 由 16px 收到 8px、顶栏高度 40→36px；③ **Element Plus 全局 `size: 'small'`**（插件级设置，与 12px 字号/紧凑密度规范互相印证），移除布局内的 `el-config-provider`；④ **分页统一**——默认每页 20 条、档位 `[10,20,30,50,100]`，前端 `config/pagination.ts` 与服务端 `common/constants.ts` 双端对齐（服务端对越界值回退默认），sites/content/members/admin-users 默认值由 15 统一为 20，内容与会员列表补齐每页条数选择，全部列表页 layout 改为 `total, sizes, prev, pager, next` |
| 26   | 10-06 | **按钮统一防抖 + loading（两个独立概念）**：新增 `app/utils/tool.ts`——**时间维度** `debounce(fn, DEBOUNCE_WAIT)` / `throttle`（默认 `leading: true`，即先触发后防抖：首次立即执行、400ms 窗口内重复调用被过滤），**状态维度** `useLoading()`（`run` 整块互斥 / `runKeyed(key, fn)` 行级互斥 / `isLoading(key)` 绑按钮 loading）；写操作按钮统一「防抖在外、loading 在内」组合，覆盖站点（删除/预览/切换渲染模式）、内容（提交/发布/保存/体检）、会员删除、用户/角色/菜单（刷新/删除）、站点与内容编辑页（保存/上传）及 5 个弹窗提交按钮（纯导航、打开弹窗、本地表单增删行等无副作用操作为什么不纳入：无请求、无误触风险）；同时去掉站点列表「编辑 →」的箭头图标 |
| 27   | 10-06 | **操作列统一（文案 / 颜色 / 结构）**：操作列一律 `el-button link size="small"`，跳转动作（编辑）由 `NuxtLink` 改为 `navigateTo` 以统一间距与色彩（移除页面内 `.link` 强调色覆盖）；文案归口词典——站点「删」→「删除」、「新增会员」→「新建会员」、内容「提交」→「提交审核」、弹窗「确定」「保存授权」→「保存」、站点编辑页「取消」→「返回」；颜色按语义统一——编辑/保存改 `primary`、发布/提交审核改 `success`、删除 `danger`、预览/刷新/授权/加子菜单保持中性默认色；操作列宽度随文案调整（站点/内容 180） |
| 28   | 10-06 | **Sass 弃用告警修复（消除 dev/build 报错观感的刷屏）**：`main.scss` 的 Element Plus 主色 light-3~9 / dark-2 梯度由全局 `mix()` 改为模块函数 **`color.mix()`**（文件顶部 `@use 'sass:color'`）。原因：项目依赖 `sass@1.105` 使用现代 API，全局内置颜色函数已被标记弃用并会在 dev/build 输出 `DEPRECATION WARNING [global-builtin]`（Dart Sass 3.0 将移除）。`color.mix()` 的参数顺序与权重语义和旧写法一致（实测编译产出色值逐位相同），规范同步至 AGENTS §7、spec/03 §2.3 |
| 29   | 10-06 | **站点编辑页去 Tab 化 + 移除渲染与主题色**：站点深入编辑页由「四个 Tab」改为**单页三分区**（基本信息 / 企业资质 / SEO 设置，区块间以分隔线区隔），删除自绘 Tab 与 `activeTab` 状态；移除「渲染与主题」区块——**渲染模式**只在站点列表页开关（编辑页不再出现，避免双入口状态不一致），**站点状态**归入基本信息；**主题色**（主色/数据高亮色/底色/文本色）不再由后台编辑（站点主题由 `app/config/site-defaults.ts` 默认值 + 服务端 `SITE_DEFAULTS.theme` 兜底）；同步删除 `RENDER_MODE_HINT` 与 `.tabs` / `.tab` / `.mode-row` 样式 |
| 30   | 10-06 | **站点支持多域名映射（主域名唯一 + 别名域名表）**：`Site.domain` 明确为**主域名**（SEO 绝对 URL / sitemap / llms.txt / 列表「预览」仍用它），新增 `SiteDomain` 表（`siteId` + `domain` 唯一、级联删除）承载**别名域名**（`www.` 前缀、不同后缀、历史与备案备用域名）；站点新建/编辑接口新增 `domains: string[]`（全量替换语义）、列表与详情返回该数组，服务端事务内 diff 同步并校验别名域名全局唯一（与任何站点主域名/别名域名重复返回 `400`）；列表关键字搜索扩展为同时匹配别名域名；`/public/**` 的 `:key` 与 GEO 项目 SSR 的 Host 反查扩展为 **slug \| 主域名 \| 别名域名**（GEO 侧零改动）；后台站点列表「访问地址」列改为**域名映射**（主域名 + 别名数量）、编辑页基本信息新增域名映射区块（主域名 + 别名域名增删）；决策见 ADR-022 | |
| 31 | 10-06 | **站点内容编辑器（最小完整版）+ 块代码化 + 完整建站**：① 新增「站点内容编辑器」工作台（左树 = 目录→页面→块，右侧上预览下操作，画布 iframe 渲染站点真实外观）；② **块代码化**——块 = 数据库存储的 Vue SFC（`BlockDefinition`），在线纯代码编辑，**字段声明写在块代码内**（`defineBlock({ key, name, fields, dataSource })`）由服务端编译校验并抽取，后台自动生成数据表单；公共块 + 站点私有块，代码版本留档 + 回退上一版；③ **URL 不可变**——页面发布后 slug 与所属目录锁定（服务端 400），不做 301；④ **发布**收敛为「单页 / 整站」，顶部待发布清单 + 发布前二次确认告知影响线上；⑤ **产物清单** `_trillion.json` 作为页面 ↔ 产物一一对应的事实来源，支持回退上一版与整站重建修复；⑥ **站点下载**（完整包 / 纯静态包）；⑦ **GEO 分层**——块只输出语义化与块标识，页面负责 JSON-LD/canonical/标题描述，站点负责机构实体声明（`MedicalClinic` 全站唯一）/ llms.txt / robots / 完整摘要，GEO 内容支持「自动+追加 / 全量覆盖」双模式与手动生成查看；⑧ **导航独立配置**（头部主导航 + 页脚四列，内容树不驱动导航）；⑨ **医疗内容合规**——编审信息为发布前置、案例类不提供疗效/评价/费用字段；⑩ **必须先修的既有缺陷**——`build-sites.mjs` 增量构建会丢页并使 sitemap/llms 缩水（修复：复制现有产物 + 全量索引 + 保留上一版）；⑪ 一期只做 SSG 生成 + dev 运行态预览，**明确不做 MCP/agent 相关能力**；⑫ 落地《医疗机构 GEO 官网》设计稿（24 整页 + 27 块）并完成建站目标 `西安新城仁爱皮肤病医院`（真实 NAP 已录入，正文先用设计稿占位内容）**（注：该建站目标已于 2026-10-08 作废并重建，页数与块数以新设计稿为准，新方案见 `design/xara-bdf-site/RENAI-CLEANUP-AND-REBUILD-PLAN.md`）**。完整规格见 [`spec/09-site-editor.md`](./spec/09-site-editor.md)，决策见 ADR-023 ~ ADR-030 |
| 32   | 10-07 | **站点列表隐藏渲染模式 + 预览按「主域名 + 站点前缀」**：站点列表移除「渲染模式」开关列与模式筛选（本期纯 SSG，该入口暂不暴露），新增「站点前缀」列展示 `slug`；操作列「预览」地址由「仅主域名」改为**主域名 + 站点前缀**（如 `http://localhost:3002/example-site`），解决本地多站点共用 `localhost:3002` 时预览总落到同一站点的问题；站点前缀复用 `slug`（站点标识 / SSG 产物目录名），编辑页基本信息区可改并给出预览拼装说明（零数据库迁移） |
| 33   | 10-07 | **GEO 站点前缀解析（本地预览可用）**：渲染引擎在回环地址（`localhost` / `127.0.0.1`）下改为按 URL **首段**解析站点——该段需经服务端确认确为站点标识 `slug`（否则回退 `NUXT_PUBLIC_SITE_SLUG`），并作为「站点前缀」从页面路径中**剥离**（`/example-site/visit` → `path=/visit`），使后台预览地址 `http://localhost:3002/<slug>` 落到目标站点而非 404；线上仍按请求 Host（主域名 / 别名域名）解析，SSG 构建期不受影响（路径即产物路径）；解析结果随 SSR payload 传给客户端，站点内无前缀导航不重复请求、无 hydration 漂移 |
| 34   | 10-07 | **预览票据地址补站点前缀（修「预览 B 站点却看到 A 站点」）**：回环基址（`preview.geoBaseUrl`）下，`POST /preview/ticket` 返回的 iframe `url` 由 `${base}${path}` 改为 `${base}/${slug}${path}`（首页不带尾斜杠），与 GEO 的回环前缀解析口径对称；新增服务端 `common/utils/url-host.ts`（`hostnameOf` / `isLoopbackUrl`，回环清单与 GEO 的 `LOOPBACK_HOSTS` 对齐）；GEO 侧 `stripSitePrefix` 兜底尾斜杠（`/<slug>/` → `/`） |
| 35   | 10-07 | **站点前缀统一补齐 + 地址拼装收敛到 shared**：① 新增 `@trillion/shared` 的 `utils/geo-url.ts`（`LOOPBACK_HOSTS` / `hostnameOf` / `isLoopbackUrl` / `normalizeBaseUrl` / `siteUrlPrefix` / `buildSiteUrl`），服务端预览票据、后台站点列表「预览」、GEO 回环判定三处共用一份拼装规则，删除变更 34 的服务端临时工具 `common/utils/url-host.ts`（GEO 的 `LOOPBACK_HOSTS` 也改为复用 shared）；② GEO 回环地址下前缀**恒等于站点标识**（默认站点也带前缀），新增全局中间件 `app/middleware/site-prefix.global.ts`，把缺前缀的页面路径统一改写成 `/<slug><path>`（query/hash 保留、预览票据不丢），覆盖首屏 SSR、客户端导航（含 Block 写死的 `to="/visit"`）、刷新与新窗口——实测 `/` 302→`/star-tech`、`/visit` 302→`/star-tech/visit`、`/star-tech/visit` 200 |
| 36   | 10-07 | **一键上线 + 数据库增量发布**：新增根命令 `pnpm release:test` / `release:prod`（`scripts/release.mjs`，零依赖），把测试 / 生产上线收敛为一条命令，固定顺序 **体检 → 构建（shared → 服务端 → 管理后台 → GEO 项目）→ `prisma migrate deploy` → 释放端口 → 生产模式启动（各应用 `start:prod`）→ HTTP 就绪探测 + `/api/health` 健康检查**，任一步失败立即中止（构建失败不动数据库、迁移失败不重启进程）；体检阻断项含 `JWT_SECRET` 占位值/长度、`PUBLIC_HOST` 回环、生产缺 `CORS_ORIGINS`、生产库口令为空、`--skip-build` 但产物缺失（`--force` 可放行），并支持 `--check` 只体检；数据库侧新增 `pnpm db:status`（只读看迁移状态）与 `pnpm db:deploy`（`prisma migrate deploy`：只应用未执行迁移、非交互、幂等、空库自动建库），`pnpm db:migrate` 明确限定仅本地开发；端口查询/结束/释放逻辑抽为 `scripts/port-guard.mjs`，`dev.mjs` 与 `release.mjs` 共用；入口与健康结论落盘仓库根 `release-endpoints.txt`（不入库）。（同一日修正为「代码上线 / 数据库上线分离」，见第 37 条）|
| 37   | 10-07 | **数据库上线与代码上线分离**：新增 `scripts/db-release.mjs` + 根命令 `pnpm db:deploy` / `db:deploy:test` / `db:deploy:prod`（`--env` 亦可透传）与只读的 `pnpm db:status[:test|:prod]`；数据库发布顺序固定为 **体检（目标库 / 生产库口令为空或占位值即阻断，防改错库）→ 只读检查（`prisma migrate status`）→ `prisma migrate deploy`（只应用未执行迁移、幂等、空库自动建库）→ 复核**，只做增量应用、永不 `db push` / reset；**代码上线器 `release.mjs` 移除迁移步骤**（`--skip-migrate` 一并取消），改为体检里做**只读**迁移检查：目标含服务端且结构落后（未应用迁移 / 库不存在 / 不可达）即**阻断**并提示先跑 `pnpm db:deploy --env <环境>`，目标只有 admin/geo 时跳过；完整上线因此是**两条各可重复执行的命令**（结构变更时先 `db:deploy:<环境>` 再 `release:<环境>`）。理由：结构变更与代码发布的执行时机、影响面（不可回滚 / 可能锁表）与审计点不同，不应混为一谈。文档见 [`spec/07`](./spec/07-deployment.md) §1/§3.2/§3.5/§7，决策见 ADR-034 |
| 38   | 10-07 | **块隔离（公共块降级为模板）+ 内容编辑器体验修复**：① **块隔离**——`siteId = 0` 的公共块改为**模板库**（只作模板，不再是站点的渲染来源），站点引用某块时把它**复制成本站自有块**（新增 `src/modules/blocks/block-copy.ts` 的 `copyTemplatesToSite`，唯一实现、幂等），此后改站点块只影响本站、改模板只影响之后新引入的站点；复制时机：保存草稿（首次引用）/ 建站导入 / 发布前兜底 / 块库「引入本站」/ 存量数据由 `prisma/backfill.ts` • `prisma:seed` 补齐；`codeHashMap` • `rendererManifest` • `PublicService.routes` 保留「本站块优先 + 模板兜底」仅作半迁移数据的安全网；**不改表结构**（`scope` / `siteId` / 唯一键沿用），另外修掉「新建块 scope=public 未校验平台级」的权限洞。② **界面**——内容 / 页面 菜单下并列「块库」（本站块 + 可引入的公共模板）与**新建的**「块模板」（模板库，平台级）；块代码页由列表以**新标签页**打开（避免跳转丢失工作台现场，编辑器块抽屉的「编辑代码」同样新标签）；内容编辑器「页面 / 块 / 发布」改为右侧抽屉、预览画布占满一屏、左树可搜索、点目录直接打开其下第一个页面、预览头部展示页面访问地址（可复制）与预览态提示，顶部新增「增量发布(n)」（带 `?` 说明，一次发布本站全部待发布页）。决策见 ADR-035，文档见 [`spec/09`](./spec/09-site-editor.md) §4.5/§6 |
| 39   | 10-07 | **本地数据直接执行 + 侧栏菜单重构 + 专有名词统一**：① **本地数据侧**：`pnpm db:seed` / `pnpm db:backfill` 已按本地库直接执行（幂等，可重复跑），两站点共补齐 **27 个块副本**（注：仁爱站点已于 2026-10-08 清理，现仅剩 star-tech）、内置角色授权补齐；线上仍保持「代码上线 / 数据库上线」两条独立命令（ADR-034），本次**无表结构变更**故不需要 `db:deploy`。② **修 `backfill` 既有缺陷**：地址物化把 `slug = index` 一律当首页 → 一个站点每个目录的索引页全被算成 `/`，直接撞 `Page` 的 `[siteId, path]` 唯一索引使回填中断；现按「`home` → `/`、`index` → 该目录地址」物化，并新增**地址冲突保护**（目标地址已被同站点其他页面占用时跳过并报告，不再中断整批）。③ **侧栏菜单重构**：「内容 / 页面」与「块库」改为**同级**（原先它俩是父子关系，而带子菜单的节点在侧栏不可点击，页面列表点不进去），上面新增父菜单 **`内容管理`**；菜单种子幂等键由「上级 + 名称」改为 **`path`**（否则改层级会多出一份重复菜单），并新增**内置角色按定位补齐授权**（只增不减）——此前「内容编辑器 / 块库 / 导航管理」从未授权给内置角色，侧栏里根本看不到。④ **专有名词统一**：新增界面字典 `apps/admin/app/config/glossary.ts`（55 条 `TERMS.<key> = { label, hint }`，界面文案唯一事实来源）+ `components/TermHint.vue`（名词 + 问号，hover/聚焦出解释，问号样式统一为全局 `.term-mark`），覆盖站点 / 内容 / 块 / 监控 / 系统设置 / 导航 / 下载与各表单弹窗共 **23 个页面与组件**（登录页与会员页无专有名词，未接入）；文档侧新增 [`GLOSSARY.md`](./GLOSSARY.md) 术语表（9 组），并在 `AGENTS.md` / `REQUIREMENTS.md` / `spec/INDEX` / `spec/03~09` 首部挂线索与就近标注 |
| 40   | 10-08 | **构建状态可视化 + 手动发布互斥**：① **状态来源不新增表结构**——构建状态取 `PublishTask` 最新一条记录：`GET /publish/artifacts/:siteId` 增 `task`、`GET /sites` / `GET /sites/:id` 增 `build`（`{ id, scope, status, createdAt, finishedAt, log }`，`null` = 从未构建），任务时间输出改走 `formatDateTime`（原先直出 Date，前端看到的是 ISO 串）。② **同站点手动入口互斥**：站点存在 `pending` / `running` 任务时，`POST /publish/page\|site` 直接返回 `409` 并提示「正在构建中 / 已有任务排队中」，**不再静默排队**——手动入口必须让运营看到「现在不能点」；系统入口（建站导入 `publish: true`）仍走排队，避免导入被已排队任务挡下；内存构建锁 + DB 状态继续双重保证同站点不并发构建。③ **界面**：站点管理列表新增「构建状态」列（未构建 / 排队中 / 构建中 / 构建成功 / 构建失败 + 时间，失败悬停看日志尾部）；内容编辑器工具条展示构建状态（含已运行时长），**进行中时三个按钮全部禁用**（增量发布 / 整站重建转圈，GEO 索引更新仅禁用——构建期间它与构建同写产物目录），进行中每 3~4 秒轮询、结束自动刷新左树与产物徽标并提示「构建完成 / 失败原因」；锁定以服务端状态为准（刷新页面、换人换浏览器同样锁定）。④ **顺手修**总览「最近发布任务」两处既有缺陷：`row.type` 字段名错（Prisma 属性为 `scope`）导致类型恒显示「页面发布」、任务时间显示 ISO 串。文档见 [`spec/05`](./spec/05-api-contract.md) §3.6、[`spec/06`](./spec/06-publish-and-geo.md) §1.1、[`spec/09`](./spec/09-site-editor.md) §6.2/§6.3 |
| 41   | 10-14 | **西安仁爱站点：电话号码一律纯展示**：全站（顶栏「预约热线」/ 页脚 NAP / `telbar` 页底横幅按钮 / `hero-dark`・`hero-panel` 行动按钮 / `visit-cards` 联系电话）不再渲染 `tel:` 链接，无跳转、无点击逻辑——行动按钮中 `tel:` / `mailto:` / 空链接渲染为 `span.btn`（保留外观，`site.css` 抑制手型光标与悬停反馈），站内路径仍用 `NuxtLink`；`telbar` 块字段删除 `href`；机器抽取所需 `telephone` 由 JSON-LD `MedicalClinic` 节点继续输出。涉及 `prisma/blocks/{telbar,hero-dark,hero-panel,visit-cards}.vue`（模板真源，`db:seed` + `resync-site-blocks.mjs` 下发副本）与 `apps/geo/app/components/frame/{FrameTopBar,FrameSiteFooter}.vue`；规范同步 [`spec/03`](./spec/03-frontend-architecture.md) §4.4 |
| 42   | 10-14 | **站点管理子菜单体系 + 新闻/问答后台管理 + 素材库原位替换**：① 「站点管理」改**目录型**菜单（path=null），子菜单「站点列表 /sites（原页面改名）/ 新闻资讯 /sites/news / 高频问答 /sites/faqs」；新增服务端 `news-faq` 模块（11 个端点）与后台两页面 + `NewsDialog` / `FaqDialog` / `PlainTextEditor`（wangEditor 纯文本封装）——新闻/问答以 Page+块数据存储，**增删改即发布**（自动重算 /news、/faq 派生块与 related-faq 并入队页面级发布，保存即 `published`）；② **素材库原位替换**——`PUT /files/:id/replace` 保持 URL 不变仅换文件（MIME 须与原记录一致），素材管理页加「替换」，站点图片引用不重发站点即生效；③ 块定义变更：`post-list` 去分类 + `pageSize=10` 客户端分页（?page=）、`article-meta` 去分类，公共模板经 `PUT /blocks/:key`（site 维度）显式同步站点副本后整站重发；④ GEO 新增 `/static/**` 同源代理（Nitro 路由，站点图片走素材库 URL）；⑤ `sync-site-images.mjs` 把页面 `/assets/img/**` 迁入素材库（71 条，28 张缺失 env 图占位、`originalName` 保留待替换）；⑥ 发布管线修复：`syncPublishedHashes` 对清单失联 pageId 按库存活过滤（站点数据重建后不再抛错）。文档见 [`spec/03`](./spec/03-frontend-architecture.md) §2.1 / [`spec/05`](./spec/05-api-contract.md) §3.13 / [`spec/06`](./spec/06-publish-and-geo.md) §7.6~§9 / [`spec/09`](./spec/09-site-editor.md) §7.2 与本文件 §5.2 / §5.4 |
| 43   | 10-15 | **新闻/问答表驱动重构 + 服务前缀统一**：① 新闻/问答改**独立数据表** `NewsArticle` / `FaqItem` 为唯一管理源（新增 `prisma/schema/news-faq.prisma` + 手工迁移 + `backfill-news-faq-tables.mjs` 幂等回填 7 新闻 / 102 问答），列表/详情直读表、按表记录 `id` 寻址，**详情不再收 `siteId` 参数**（根除旧「前端未传 siteId、NaN 比较恒 404」缺陷）；`Page` 降级为**发布产物**（`pageId` 弱引用、页面缺失保存自动补建），`slug` 创建后不可改；增删改仍同步派生块并自动页面级发布；**新闻 `publishDate` 必填、`YYYY-MM-DD`、不允许早于今天**（服务端中国时区 `todayInChina()` 强校验 + 管理端弹窗禁选过去日期），问答无发布日期字段；② **服务前缀统一**：服务端全局前缀 `/api` → **`/geoserver`**（`main.ts` / Swagger / 容器 healthcheck），管理后台挂 **`/geocms/`** 基础路径（`app.baseURL`），`apiBase` 改**绝对基址** `http://<PUBLIC_HOST>:<PORT_SERVER>/geoserver`（服务端消费者不做同源改写），后台 401 判断走 `currentRoutePath()` 剥 baseURL、新标签页统一 `router.resolve`。决策见 ADR-039 / ADR-040，文档见 [`spec/05`](./spec/05-api-contract.md) §3.13、[`spec/06`](./spec/06-publish-and-geo.md) §8、[`spec/03`](./spec/03-frontend-architecture.md) §2.1~§2.2 与本文件 §5.4 / §10 |


## 16. 首轮构建修复清单（已解决，勿回退）

| #   | 问题                                                                                             | 修复                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1   | 守卫（AdminAuthGuard）依赖 JwtService，各业务模块未注册导致 DI 报 `UnknownDependenciesException` | 新增全局 `src/common/common.module.ts` 注册并导出 JwtModule，`app.module.ts` 首个引入；AuthModule 改为复用 |
| 2   | `jsonwebtoken` 的 `expiresIn` 仅接受 `StringValue \| number`，配置里的 string 报错               | 新增 `src/common/utils/jwt-expiry.ts` 的 `jwtExpiresIn()` 集中收窄                                         |
| 3   | Prisma JSON 字段不接受缺索引签名的业务对象（RobotsPolicy/ThemeConfig）                           | 新增 `src/common/utils/json.ts` 的 `toJsonInput/fromJson`                                                  |
| 4   | `groupBy` 使用 `take` 必须同时给 `orderBy`                                                       | `aiOverview` 补 `orderBy: { _count: { path: 'desc' } }`                                                    |
| 5   | 守卫里 `current-user.decorator` 相对路径写错（多了一层 `common/`）                               | 改为 `../decorators/current-user.decorator`                                                                |
| 6   | `nest build` 与 `deleteOutDir: true` + `incremental: true` 冲突，二次构建清空 dist 且不产出      | `tsconfig.json` 关闭 `incremental`                                                                         |
| 7   | 服务端 tsconfig 未设 `rootDir`，shared 类型被纳入编译导致产物落到 `dist/apps/...`                | 设 `rootDir: ./src`，shared 改为编译型包并指向 `dist/index.d.ts`                                           |
| 8   | 接口时间输出用 `toISOString()`，比北京时间早 8 小时                                              | 新增 `utils/datetime.ts`，并在 `main.ts` 覆盖 `Date.prototype.toJSON`                                      |
| 9   | SCSS：`mixins.scss` 被 `@use` 引入时拿不到令牌变量（`additionalData` 只作用于入口文件）          | `mixins.scss` 顶部显式 `@use "tokens.scss" as *`                                                           |
| 10  | Nuxt impound 误判 `../../config/api` 为 Nuxt 构建期模块，admin 构建失败                          | admin 内一律改用 `~/config/...` 别名导入                                                                   |
| 11  | Nitro 的 `prerender:routes` 钩子直接传 `Set<string>`（不是 `{ routes }`）                        | 兼容两种形态                                                                                               |
| 12  | GEO 页面在模板里写 `<script type="application/ld+json">`，Vue SFC 不允许 → 渲染 500              | JSON-LD 改为 `useHead({ script: [...] })` 注入（PageRender + BlockFaq）                                    |
| 13  | `usePage()` 返回的 `path` 是字符串却按 `path.value` 使用 → `undefined.split` 崩溃                | 直接使用 `path`                                                                                            |
| 14  | `Page` 无 `channel` 关联字段，Prisma 关联过滤报错                                                | 先查 Channel 再按 `channelId` 过滤                                                                         |
| 15  | 示例站点缺首页，SSG 时 `/` 404                                                                   | seed 增加「首页」栏目与 slug 为 `home` 的首页                                                              |
| 16  | `nuxt generate` 默认 `publicDir` 为 `sites/`，会清空已发布站点目录                               | 缺省改为 `dist`，构建脚本显式传 `sites/<slug>/.tmp`                                                        |
| 17  | 构建脚本硬编码 `<app>/node_modules/nuxt/bin/nuxt.mjs`，hoisted 模式下不存在                      | 改为多候选路径探测                                                                                         |

## 17. 站点内容编辑器与块代码化（2026-10-06 新增）

> **完整规格见 [`docs/spec/09-site-editor.md`](./spec/09-site-editor.md)**；决策见 [`spec/08-adr.md`](./spec/08-adr.md) ADR-023 ~ ADR-030 与 **ADR-035（块隔离）**。

### 17.1 形态

- 入口：侧栏 **「内容管理」父菜单下的五个同级入口**——内容 / 页面（页面列表）/ 内容编辑器 / 块库 / 块模板（平台级）/ 导航管理；站点列表操作列「内容编辑器」直达工作台
- 布局：左侧可搜索内容树（目录 → 页面 → 块，带状态徽标与基础树操作，点目录直接打开其下第一个页面），右侧 **预览画布占满一屏**（iframe + 预览态标记 + 页面访问地址可复制），「页面 / 块 / 发布」改为右侧抽屉
- 树操作一期：新建 / 删除 / 重命名 / 上下移；**不做拖拽与跨目录移动**（backlog）

### 17.2 块代码化

- 块 = 数据库存储的 **Vue SFC**（`BlockDefinition`，template / script / scss），后台在线纯代码编辑（CodeMirror + Prettier）
- **字段声明写在块代码内**：`defineBlock({ key, name, fields, dataSource })`；服务端 `@vue/compiler-sfc` 编译校验（错误返回行号）并抽取声明；后台据此自动渲染块数据表单
- 归属（**块隔离**，见 ADR-035）：**公共块 = 模板库**（`siteId = 0`，只作模板，站点首次引用时复制一份本站副本）+ **站点块**（本站独有，改代码只影响本站）；权限：平台级可编模板与任意站点块，站点级仅本站块
- 存量公共块由 `prisma/backfill.ts` / `prisma:seed` 按各站页面引用补齐站点副本，复制逻辑只有一处（`copyTemplatesToSite`，幂等）
- 代码版本留档 + 「回退上一版」；保存页常驻风险提示（代码将在构建与渲染进程执行）
- 列表类块支持 `dataSource.kind = childPages`：列表页取「所在目录下的子页面集合」，卡片字段来自详情页指定块，避免同数据录两遍

### 17.3 三态与发布

- 保存草稿（`Page.draft` 整页快照，不改线上不构建）/ 预览（渲染引擎 dev 模式读草稿 + 最新块代码）/ 发布（才重生成产物）
- 发布粒度：**单页 / 整站**（不做块级）；顶部待发布清单列出所有改动页（含块代码变更牵连页）
- 发布前二次确认并告知影响线上：受影响页面、线上地址、当前线上版本时间、发布前检查结果
- 发布前检查（阻断）：缺 title/description、canonical 重复、医疗内容缺编审信息、案例含禁止字段、无机构实体声明、无 llms.txt 或 robots 缺 AI 策略说明；（警告）：robots meta 未开完整摘要、NAP 三处不一致、数据条缺统计口径、sitemap 缺核心 URL

### 17.4 产物、回退与下载

- 产物清单 `sites/<slug>/_trillion.json` 是页面 ↔ 产物一一对应的事实来源（页面标识 / 路径 / 产物文件 / 内容指纹 / 各块代码指纹）
- 回退：**只保留上一版**（构建保留 `.old`），回退只回退产物、不回退数据库内容；修复 = 整站重建 / 仅重生成 GEO 产物
- 站点下载：完整包（含客户端资源，可直接托管）/ 纯静态包（CDN 回源）；下载前若存在未发布改动需二次确认

### 17.5 GEO

- 分层：块只输出语义化结构与块标识；页面负责 JSON-LD / canonical / 标题描述；站点负责机构实体声明（`MedicalClinic`，实体档案页输出，其他页 `@id` 引用，**全站只定义一次**）/ `llms.txt` / `robots.txt`（含 AI 爬虫策略说明）/ `robots meta`（完整摘要 `max-snippet:-1`）
- 双模式：`GeoDoc { mode: 'auto_append' | 'override', custom }`；可查看实际生成内容、手动重新生成、「以自动结果为基础编辑」
- 变量占位符 `{{site.*}} / {{page.*}} / {{now:YYYY-MM-DD}}` 在构建期 / 请求期解析

### 17.6 其他约束

- **URL 不可变**：页面发布后 slug 与所属目录锁定；删除已发布页 = 下线清理，不做 301
- **导航独立配置**：头部主导航 + 页脚四列；内容树仅用于后台可视化管理，**不驱动**站点导航
- 机构实体档案页是 **NAP 唯一事实来源**，其他页面只读引用并保持逐字一致
- 本阶段：SSG 生成 + dev 运行态预览；`renderMode` 字段保留但后台不暴露 SSR 切换；站点外观与后台主题完全解耦
- **明确不做**：MCP / agent 相关能力

### 17.7 建站目标

> 建站目标、清理口径与落地批次以 `design/xara-bdf-site/RENAI-CLEANUP-AND-REBUILD-PLAN.md` §六 为准。
> 本节只保留**需求锚点口径**（真实 NAP + 站点标识 + 主题 + 页面/块数依据），不再固化页数与块数的具体数字。

建站目标为「医疗机构 GEO 官网」类站点，页面与块以 `design/xara-bdf-site/` 新设计稿为准
（整页清单见该目录 `FILE-LIST.md`；块清单见 `99-blocks.html`）。

| 项 | 值 |
| -- | -- |
| 对外常用名 | 真实机构名（NAP 事实来源，见建站方案 §6.2.3） |
| 地址 | 真实 NAP |
| 电话 | 真实 NAP |
| 门诊时间 | 真实口径 |
| slug | `xian-renai-skin`（已定稿） |
| 主题 | 设计稿 `theme-b.css` 令牌（青绿 `#2DD4BF` + 深色底 `#0A1628`） |
| 页面与块数 | **以 `design/xara-bdf-site/` 新设计稿为准**（旧「24 整页 + 27 块」口径已作废） |
| 内容 | 先用设计稿占位内容，后续在编辑器内替换为真实内容 |
| 待补字段 | 工商全称、统一社会信用代码、医疗机构登记号、执业许可证有效期、机构类型/等级、诊疗科目、法定代表人、成立日期、医保定点编号、sameAs 清单 |
| 字段口径 | 结构化实体字段以建站方案 §6.1 / §6.2 为准 |

### 17.8 Backlog（后置）

301 重定向、拖拽排序与跨目录移动、乐观并发锁、构建期代码快照冻结校验、N 版历史与任意版本回退、iframe 点击回传联动、设备宽度切换、危险 API 扫描引擎、独立 GEO 就绪度面板、news 动态数据块、SSR 站点形态、下载包子路径部署。详见 [`spec/09-site-editor.md`](./spec/09-site-editor.md) §14。
