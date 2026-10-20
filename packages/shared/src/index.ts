/**
 * 共享类型统一出口
 * 管理后台、GEO 项目、服务端共用这里的类型定义，避免契约重复定义导致漂移。
 *
 * ⚠️ 相对导入必须带 `.js` 扩展名：本包以 ESM 发布（package.json "type": "module"），
 *    无扩展名的相对说明符无法被 Node 原生 ESM 解析（服务端 `require(esm)` 会直接抛
 *    ERR_MODULE_NOT_FOUND）。打包器（Vite / webpack）对带扩展名的写法同样兼容。
 */

export * from './types/site.js'
export * from './types/site-profile.js'
export * from './types/content.js'
export * from './types/api.js'
export * from './types/menu.js'
export * from './types/role.js'
export * from './types/block.js'
export * from './types/editor.js'
export * from './types/navigation.js'
export * from './utils/placeholders.js'
export * from './utils/block-code.js'
export * from './utils/geo-url.js'
