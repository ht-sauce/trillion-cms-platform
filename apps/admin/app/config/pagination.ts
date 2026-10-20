/**
 * 分页约定（全局统一，禁止各页面自定档位）
 * 默认每页 20 条，可选 [10, 20, 30, 50, 100]
 * 必须与服务端 `apps/server/src/common/constants.ts` 的 PAGE_SIZE_DEFAULT / PAGE_SIZE_OPTIONS 保持一致
 */

/** 默认每页条数 */
export const PAGE_SIZE_DEFAULT = 20

/** 每页条数可选档位（el-pagination 的 page-sizes） */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100]

/** el-pagination 统一布局：总数 + 每页条数 + 页码 */
export const PAGINATION_LAYOUT = 'total, sizes, prev, pager, next'
