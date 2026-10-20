<script setup lang="ts">
/**
 * 岗位行（原型 `.job`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM（theme-b.css `.job`）：
 *   .job > (div > (h4 + div.meta > span*)) + div.req + a.btn
 *   3 列网格：主信息 / 任职条件 / 行动按钮。
 *
 * 设计稿硬约束（09 §7.2 ④）：
 * 1. **不设薪酬字段** —— 薪酬不进结构化模板，避免在抓取中被当作承诺；
 * 2. 过期岗位改 status 为「已招满」而非删除，保留历史可追溯；
 * 3. requirement 写职责与任职条件的事实，不写「待遇面议」类模糊承诺。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'job-list',
  name: '岗位行',
  hint: '岗位清单，不设薪酬字段，过期改状态不删除',
  fields: [
    { key: 'title', label: '区块标题', type: 'text', hint: '会作为大标题显示，如「在招岗位」' },
    {
      key: 'items',
      label: '岗位',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'title', label: '岗位名称', type: 'text', required: true },
          { key: 'dept', label: '所属部门', type: 'text' },
          { key: 'headcount', label: '招聘人数', type: 'text' },
          { key: 'type', label: '用工类型', type: 'text', hint: '全职 / 兼职 / 实习' },
          { key: 'education', label: '学历要求', type: 'text' },
          { key: 'requirement', label: '任职条件', type: 'textarea' },
          {
            key: 'status',
            label: '状态',
            type: 'select',
            options: ['在招', '已招满'],
            required: true,
            hint: '过期岗位改状态，不删除'
          },
          { key: 'updatedAt', label: '更新日期', type: 'text', hint: 'YYYY-MM-DD' }
        ]
      }
    }
  ]
})
</script>

<template>
  <h2 v-if="data.title" class="job-list-title">{{ data.title }}</h2>
  <div v-for="(job, index) in data.items || []" :key="index" class="job">
    <div>
      <h4>{{ job.title }}</h4>
      <div class="meta">
        <span v-if="job.dept">{{ job.dept }}</span>
        <span v-if="job.type">{{ job.type }}</span>
        <span v-if="job.education">{{ job.education }}</span>
        <span v-if="job.headcount">招 {{ job.headcount }} 人</span>
        <span v-if="job.updatedAt">{{ job.updatedAt }} 更新</span>
      </div>
    </div>
    <div class="req">{{ job.requirement }}</div>
    <span class="badge" :class="job.status === '在招' ? 'ok' : 'gray'">{{ job.status }}</span>
  </div>
</template>

<style>
/* 岗位状态徽标用原型 .badge；「区块标题」与行间距按原型上下文补最小间距 */
.job-list-title {
  font-size: 19px;
  font-weight: 800;
  margin-bottom: 16px;
}

.job + .job {
  margin-top: 12px;
}
</style>
