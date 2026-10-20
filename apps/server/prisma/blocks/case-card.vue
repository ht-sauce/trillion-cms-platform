<script setup lang="ts">
/**
 * 脱敏案例卡（原型 `.grid-N` + `.case`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM（theme-b.css `.case`）：
 *   .grid-N > .case > (div.hd > span.id + span.cat) + (div.bd > h4 + div.kv > div.r*(span.k + span.v))
 *                   + (div.ft > span + a)
 *
 * 设计稿硬约束（合规底线，09 §7.2 ③）：
 * 1. **绝不提供** 患者姓名、面部图片、前后对比图、满意度、疗效描述、具体费用字段 ——
 *    模板层不设这些字段，是从结构上杜绝违规录入，而不是靠编辑自觉；
 * 2. 年龄用区间（ageRange），不用具体年龄；主诉为脱敏后摘要；
 * 3. planCategory 只写方案类别，不写效果承诺；
 * 4. 必须显示记录人与审核医师，诊疗记录双人可追溯。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'case-card',
  name: '脱敏案例卡',
  hint: '诊疗过程记录卡，无姓名/面部图/疗效/费用字段',
  fields: [
    { key: 'columns', label: '列数', type: 'select', options: ['2', '3'], default: '3' },
    {
      key: 'items',
      label: '案例',
      type: 'list',
      hint: '仅脱敏后的过程记录，不写疗效与费用',
      item: {
        type: 'group',
        fields: [
          { key: 'caseId', label: '案例编号', type: 'text', required: true, hint: '如 CASE-2026-018' },
          { key: 'chiefComplaint', label: '主诉（已脱敏）', type: 'text', required: true },
          { key: 'diagnosis', label: '诊断名称', type: 'text', required: true },
          { key: 'icd10', label: 'ICD-10 编码', type: 'text', required: true },
          { key: 'staging', label: '分期 / 分型', type: 'text' },
          {
            key: 'planCategory',
            label: '方案类别',
            type: 'select',
            options: ['药物治疗', '物理治疗', '光疗', '中医外治', '手术治疗', '其他'],
            required: true,
            hint: '只写类别，不写疗效'
          },
          { key: 'dept', label: '科室', type: 'text' },
          { key: 'recorder', label: '记录人', type: 'text', required: true },
          { key: 'reviewer', label: '审核医师', type: 'text', required: true },
          { key: 'ageRange', label: '年龄段', type: 'text', required: true, hint: '用区间，如 45–54 岁' },
          { key: 'recordDate', label: '记录日期', type: 'text', required: true, hint: 'YYYY-MM-DD' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="grid" :class="`grid-${data.columns || 3}`">
    <article v-for="(item, index) in data.items || []" :key="index" class="case">
      <div class="hd">
        <span class="id">{{ item.caseId }}</span>
        <span v-if="item.planCategory">{{ item.planCategory }}</span>
      </div>
      <div class="bd">
        <h4>{{ item.diagnosis }}</h4>
        <div class="kv">
          <div v-if="item.icd10" class="r">
            <span class="k">ICD-10</span><span class="v">{{ item.icd10 }}</span>
          </div>
          <div v-if="item.ageRange" class="r">
            <span class="k">年龄段</span><span class="v">{{ item.ageRange }}</span>
          </div>
          <div v-if="item.staging" class="r">
            <span class="k">分型分期</span><span class="v">{{ item.staging }}</span>
          </div>
          <div v-if="item.dept" class="r">
            <span class="k">科室</span><span class="v">{{ item.dept }}</span>
          </div>
          <div v-if="item.chiefComplaint" class="r">
            <span class="k">主诉</span><span class="v">{{ item.chiefComplaint }}</span>
          </div>
        </div>
      </div>
      <div class="ft">
        <span>记录 {{ item.recorder }} · 审核 {{ item.reviewer }}</span>
        <span v-if="item.recordDate">{{ item.recordDate }}</span>
      </div>
    </article>
  </div>
</template>
