<script setup lang="ts">
/**
 * 就诊 NAP 三格（原型 `.napgrid` + `.napcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-napcard / napgrid`：
 *   .napgrid > .napcard*(div.lb + b + p)
 *
 * 设计稿硬约束（NAP 唯一事实来源，09 §11.2 ①）：
 * 1. **名称、地址、电话一律从 context.site 只读**，不在本块录入 —— 全站不得出现第二种写法；
 * 2. 编辑入口只有实体档案页，本块字段仅保留 title 与 note；
 * 3. 地址用 <address>；电话为纯展示文本，不做 tel: 链接（2026-10-14 需求：
 *    号码无点击逻辑；机器抽取所需 telephone 由 JSON-LD 的 MedicalClinic 节点输出）。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'visit-cards',
  name: '就诊三格',
  hint: '名称 / 地址 / 电话三张信息卡；具体数值自动取自站点设置，这里只需填标题和说明文字',
  fields: [
    { key: 'title', label: '区块标题', type: 'text', hint: '会作为大标题显示，如「就诊信息」' },
    { key: 'note', label: '补充说明', type: 'text', hint: '如「各平台信息一致，以实体档案页为准」' }
  ]
})
</script>

<template>
  <h2 v-if="data.title" class="visit-cards__title">{{ data.title }}</h2>
  <div class="napgrid">
    <div class="napcard">
      <div class="lb">机构名称</div>
      <b>{{ context.site?.commonName }}</b>
      <p v-if="context.site?.legalName">工商全称：{{ context.site.legalName }}</p>
    </div>
    <div class="napcard">
      <div class="lb">执业地址</div>
      <b
        ><address class="visit-cards__addr">{{ context.site?.addressFull }}</address></b
      >
      <p v-if="context.site?.postalCode">邮政编码 {{ context.site.postalCode }}</p>
    </div>
    <div class="napcard">
      <div class="lb">联系电话</div>
      <b v-if="context.site?.phone" class="visit-cards__tel">{{ context.site.phone }}</b>
      <p>电话以实体档案页公示为准</p>
    </div>
  </div>
  <p v-if="data.note" class="visit-cards__note">{{ data.note }}</p>
</template>

<style>
/* 原型 napcard 未覆盖「标题 / 地址语义 / 电话语义」三处最小补充 */
.visit-cards__title {
  font-size: 19px;
  font-weight: 800;
  margin-bottom: 14px;
}

.napcard .visit-cards__addr {
  font-style: normal;
}

.napcard .visit-cards__tel {
  color: var(--teal-dk);
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.visit-cards__note {
  margin-top: 12px;
  font-size: 12.4px;
  color: var(--ink-3);
  line-height: 1.8;
}
</style>
