/**
 * 服务端通用常量
 * 分页约定：默认每页 20 条，可选档位 [10, 20, 30, 50, 100]（与前端 el-pagination 的 page-sizes 完全对齐）
 * 前端对应配置见 `apps/admin/app/config/pagination.ts`，两处必须保持一致
 */

/** 默认每页条数 */
export const PAGE_SIZE_DEFAULT = 20

/** 允许的每页条数档位 */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const

/** 页码从 1 开始 */
export const PAGE_DEFAULT = 1

/** 把入参收敛为合法的每页条数（越界或非法值回退默认值） */
export function normalizePageSize(value?: number | string): number {
  const size = Number(value)
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(size) ? size : PAGE_SIZE_DEFAULT
}

/** 把入参收敛为合法页码（≥ 1） */
export function normalizePage(value?: number | string): number {
  const page = Number(value)
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : PAGE_DEFAULT
}
