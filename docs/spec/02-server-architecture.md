# 02 · 服务端架构（apps/server）

> 组件级视图。回答：模块怎么划、谁依赖谁、横切能力在哪层生效、登录与菜单授权如何成为管理域安全边界。
> 数据模型见 [`04-data-model.md`](./04-data-model.md)，接口契约见 [`05-api-contract.md`](./05-api-contract.md)。

---

## 1. 分层结构

```mermaid
flowchart TB
  subgraph Entry["入口层"]
    M["main.ts<br/>TZ 设置 · 全局前缀 /geoserver · CORS · Swagger · 静态目录"]
    AM["app.module.ts<br/>模块装配"]
  end

  subgraph Cross["横切层 common/"]
    G1["AdminAuthGuard"]
    G2["MenuPermissionGuard"]
    I1["TransformInterceptor<br/>统一 {code,message,data}"]
    F1["HttpExceptionFilter"]
    D1["@CurrentUser"]
    U1["utils/datetime · json · jwt-expiry · site-scope"]
  end

  subgraph Biz["业务层 modules/"]
    B1["auth"]
    B2["sites"]
    B3["static-files"]
    B4["content"]
    B5["members"]
    B6["publish"]
    B7["track"]
    B8["entities"]
    B9["site-auth"]
    B10["public"]
    B11["menus"]
    B12["roles"]
    B13["admin-users"]
    B14["health"]
  end

  subgraph Infra["基础设施层"]
    C1["config/<br/>configuration · env.validation · ai-crawlers · database-url"]
    P1["prisma/<br/>PrismaService"]
  end

  DB[("MySQL")]

  M --> AM
  AM --> Cross
  AM --> Biz
  AM --> Infra
  Biz --> Cross
  Biz --> P1 --> DB
  Biz --> C1
```

**依赖方向规则（强制）**

```
modules/  →  common/  ✅
modules/  →  config/  ✅
modules/  →  prisma/  ✅
modules/A →  modules/B（跨模块直接注入）  ❌ 需上升为公共能力或通过事件/任务解耦
common/   →  modules/  ❌ 禁止反向依赖
```

## 2. 启动流程（`src/main.ts`）

| 顺序 | 动作                                                        | 说明                                              |
| ---- | ----------------------------------------------------------- | ------------------------------------------------- |
| 1    | `process.env.TZ = 'Asia/Shanghai'`                          | 必须在任何日期操作之前执行                        |
| 2    | `ensureDatabaseUrl()`                                       | 由 `DB_HOST/PORT/USER/PASSWORD/NAME` 拼 URL       |
| 3    | 创建 `uploads/` 目录                                        | P0 本地存储根目录                                 |
| 4    | 覆盖 `Date.prototype.toJSON`                                | 使所有接口输出北京时间，**禁止回退**（判据见 §6） |
| 5    | CORS（按 env 白名单）                                       | 站点域名动态放行                                  |
| 6    | `setGlobalPrefix('geoserver')` + 全局 Pipe / Filter / Interceptor | 统一响应与校验                                    |
| 7    | `useStaticAssets('/static')`                                | 映射到 `uploads/`                                 |
| 8    | Swagger（**仅非生产**）                                     | `/geoserver/docs`                                       |
| 9    | `listen(3001)`                                              | 见 `07-deployment.md` 端口表                      |

## 3. 模块清单

| 模块           | 控制器路由       | 职责                                                       | 鉴权                 | 站点归属 |
| -------------- | ---------------- | ---------------------------------------------------------- | -------------------- | -------- |
| `auth`         | `/geoserver/auth`      | 管理员登录（bcrypt 校验）、签发 JWT-A、`/me`               | 除登录外需 JWT-A     | ——       |
| `sites`        | `/geoserver/sites`     | 站点 CRUD、SEO/GEO 默认值、renderMode、主题配置            | JWT-A                | ✅       |
| `static-files` | `/geoserver/files`     | 上传（MIME 白名单 + 10MB 限制）、列表、删除                | JWT-A                | ✅       |
| `content`      | `/geoserver/content`   | Channel 树、Page CRUD、三态流转、GEO 体检                  | JWT-A                | ✅       |
| `members`      | `/geoserver/members`   | 站点会员查询与维护                                         | JWT-A                | ✅       |
| `publish`      | `/geoserver/publish`   | 发布任务入队、串行执行、调用构建脚本、查询任务             | JWT-A                | ✅       |
| `track`        | `/geoserver/track`     | 埋点摄取（攒批写库）、PV/UV 概览、AI 爬虫统计              | 摄取公开，查询需鉴权 | ✅       |
| `entities`     | `/geoserver/entities`  | 品牌/产品/机构实体与别名管理（GEO 实体一致性）             | JWT-A                | ✅       |
| `menus`        | `/geoserver/menus`     | 后台菜单树与菜单配置维护 | 树仅登录，维护按菜单 | —— |
| `roles`        | `/geoserver/roles`     | 角色 CRUD 与菜单授权（自动补全上级） | JWT-A + 对应菜单 | —— |
| `admin-users`  | `/geoserver/admin-users` | 用户 CRUD、角色绑定与安全护栏，无站点数据授权 | JWT-A + 对应菜单 | —— |
| `news-faq`     | `/geoserver/news-faq`  | 新闻文章 / 问答条目管理面（表为管理源、页面是发布产物）     | JWT-A                | ✅       |
| `catalog`      | `/geoserver/catalog`   | 产品体系（含行业分组）/ 成功案例管理面（同表驱动口径）     | JWT-A                | ✅       |
| `site-auth`    | `/geoserver/site-auth` | 站点会员注册/登录/校验/获取自身信息（JWT-M）               | 除登录注册外需 JWT-M | ✅       |
| `public`       | `/geoserver/public`    | **无鉴权只读**：站点配置、路由清单、页面详情、robots、实体 | 无                   | 按 key   |
| `health`       | `/geoserver/health`    | 健康检查                                                   | 无                   | ——       |

> 表中管理业务的 JWT-A 一律包含对应菜单校验；✅ 仅表示资源站点归属，不表示用户站点数据权限。逐接口映射以 §4.3 为准，接口契约见 05；路由覆盖通过真实控制器元数据测试，不依赖历史总数。

> **表驱动内容域**（`news-faq` / `catalog`）共用一套模式：管理源是独立数据表，`Page` 只是发布产物；保存后自动派生/重算页面块 → 自动触发页面级发布。派生详情页的块结构从站点既有同栏目 detail 页**克隆为模板**（[ADR-052](./08-adr.md)），代码内不含任何站点文案，换站点零改动。

## 4. 横切机制

### 4.1 统一响应

`common/interceptors/transform.interceptor.ts` 把所有成功响应包装为：

```json
{ "code": 0, "message": "ok", "data": {} }
```

异常由 `common/filters/http-exception.filter.ts` 统一包装为同构结构，HTTP 状态码保持不变。

### 4.2 鉴权与授权

```mermaid
flowchart LR
  R["请求"] --> G{"AdminAuthGuard<br/>解析 JWT-A"}
  G -->|"无效/缺失"| E1["401"]
  G -->|"有效"| U["@CurrentUser 注入身份与 roleId"]
  U --> P{"身份/导航接口？"}
  P -->|"是"| OK["放行"]
  P -->|"否"| M{"MenuPermissionGuard<br/>对应启用菜单 + RoleMenu"}
  M -->|"无授权/无声明"| E2["403"]
  M -->|"通过"| Q["业务归属、关联、发布约束与主动站点筛选"]
```

**双 JWT 域**

| 域         | Token | 载荷                                                | 适用模块                    |
| ---------- | ----- | --------------------------------------------------- | --------------------------- |
| 管理后台用户 | JWT-A | `roleId` + `roleCode` + `roleName`，`platform` 仅作角色属性展示 | auth/sites/content/roles/… |
| 站点会员   | JWT-M | `memberId` + `siteId`                               | site-auth（客户端岛屿调用） |

> 2026-11-06 按 REQUIREMENTS §9、05 §2 与用户授权方案：全平台管理业务仅按登录和对应菜单授权，不以 `platform` 或用户 `siteIds` 限制业务操作与可见范围。不自动授予菜单。身份接口 `/auth/me`、导航接口 `/menus/tree` 仅需登录；内部令牌、预览票据和会员 JWT-M 独立保留。账号启停、内置角色、不能删自己及至少一个可用平台管理用户的防锁死护栏不作为业务门槛删除。

### 4.3 站点归属与主动筛选（`common/utils/site-scope.ts`）

| 函数                             | 用途                                     |
| -------------------------------- | ---------------------------------------- |
| `assertSiteAccess(user, siteId)` | 旧调用兼容入口，不再按用户站点授权拒绝 |
| `siteWhere(user, siteId)`        | 仅按显式 siteId 构造站点主键条件，缺省不过滤 |
| `siteIdWhere(user, siteId)`      | 仅按显式 siteId 构造内容归属筛选，缺省不过滤 |

> 管理域安全边界为 JWT-A + MenuPermissionGuard。内容 siteId、同站目录/页面/文件关联、公共模板引入时复制为本站副本、公开 published 过滤均保留；取消后台数据授权不取消资源归属。旧 ADR-005 的用户站点权限口径不再适用本次授权基线。

菜单映射：sites → `/sites`；content → `/content`；editor → `/content/editor`；files → `/files`；members → `/members`；entities、geo、track 管理读口 → `/monitor`；navigations → `/navigations`；menus 维护 → `/settings/menus`；roles → `/settings/roles`；admin-users → `/settings/users`；新闻 → `/sites/news`，问答 → `/sites/faqs`，共同重建要求二者；产品/行业 → `/sites/products`，案例 → `/sites/cases`。共享选择数据允许对应消费菜单中的任一授权，但不扩大写权限。blocks 按实际 siteId/template 参数区分 `/blocks` 与 `/blocks/templates`；publish 与 preview/ticket 按消费入口 `/sites`、`/content`、`/content/editor` 授权；access-events → `/monitor`，demands 管理口 → `/sites/demands`。公开业务写口 track 摄取、会员注册/登录、需求提交保留既有专用校验，不转成匿名内容维护口。

### 4.4 配置与工具

| 文件                         | 职责                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `config/configuration.ts`    | 配置工厂，集中读取环境变量（含时区、上传、CORS、GEO 目录） |
| `config/env.validation.ts`   | **zod 启动校验**，缺关键配置直接启动失败，避免运行期才炸   |
| `config/ai-crawlers.ts`      | AI 爬虫 UA 清单、`matchAiCrawler`、`buildRobotsTxt`        |
| `config/database-url.ts`     | 由 `DB_*` 变量拼装 `DATABASE_URL`（含特殊字符转义）        |
| `common/utils/datetime.ts`   | 北京时间格式化（**唯一时间出口**）                         |
| `common/utils/json.ts`       | Prisma JSON 字段的收窄与还原（`toJsonInput` / `fromJson`） |
| `common/utils/jwt-expiry.ts` | JWT 有效期类型收窄（`StringValue \| number`）              |

## 5. 发布与构建调度（`modules/publish`）

- 发布入口：`POST /geoserver/publish/page/:siteId`（页面级增量）与 `POST /geoserver/publish/site/:siteId`（整站重建）
- **串行锁**：`PublishService` 内 `running: Set<number>` 按 siteId 加锁，同站点并发发布时后来任务保持 `pending` 排队
- 任务状态机：`pending → running → success | failed`，日志写入 `PublishTask.log`，`finishedAt` 记录完成时间
- 执行方式：`spawn` 调用 `apps/geo/scripts/build-sites.mjs`，环境变量注入站点 slug、API 地址、产物临时目录
- 详细流水线与 GEO 产物见 [`06-publish-and-geo.md`](./06-publish-and-geo.md)

## 6. 已确认的约束（勿回退）

| 约束                                                                | 原因                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 禁止在业务代码里用 `toISOString()` 输出时间                         | Prisma 按 UTC 读写 DATETIME，会导致结果早 8 小时                                       |
| `prisma.groupBy` 使用 `take` 必须同时给 `orderBy`                   | Prisma 校验要求，`aiOverview` 已用 `_count.path` 排序                                  |
| Prisma JSON 字段写入必须过 `toJsonInput`                            | 否则缺索引签名的业务对象类型报错                                                       |
| `tsconfig.json` 必须显式 `rootDir: ./src`，且关闭 `incremental`     | 否则产物落到 `dist/apps/...`；`incremental` 与 `deleteOutDir` 冲突会导致二次构建无产物 |
| `packages/shared` 必须先于服务端构建                                | 服务端 `paths` 指向其 `dist/index.d.ts`（编译型包）                                    |
| 多个业务模块共用 Guard 时必须由全局 `CommonModule` 提供 `JwtModule` | 否则 DI 报 `UnknownDependenciesException`                                              |
| `Page` 没有 `channel` 关联字段                                      | 需先查 `Channel` 再按 `channelId` 过滤，不能写关联条件                                 |

> 完整修复清单与历史背景见 [`../REQUIREMENTS.md` §16](../REQUIREMENTS.md)。

---

> 下一步：[`03-frontend-architecture.md`](./03-frontend-architecture.md) —— 管理后台与 GEO 项目。
