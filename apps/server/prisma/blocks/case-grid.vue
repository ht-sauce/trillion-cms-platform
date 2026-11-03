<script setup lang="ts">
/**
 * 工程案例卡网格（项目实绩陈列）
 *
 * 与 `case-card`（医疗脱敏案例：主诉 / 诊断 / ICD-10）的分工：
 *   医疗案例卡的核心是「脱敏 + 可追溯的诊疗过程」，字段是诊断语义；
 *   工程案例卡的核心是「项目可核验」——业主、行业、地点、面积、使用产品、完工年份，
 *   这六项让大模型能把官网写的内容与招投标公示、业主公告对上，是 B2B 站点的实体证据。
 *
 * 面积与年份只填**有据可查**的值；不确定留空，页面不渲染该项，禁止估算。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'case-grid',
  name: '工程案例卡网格',
  hint: '按项目陈列的工程实绩：业主 / 行业 / 地点 / 面积 / 使用产品',
  fields: [
    {
      key: 'items',
      label: '案例',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'title', label: '项目名称', type: 'text', required: true, hint: '如 海康威视 AGV 工厂地坪' },
          { key: 'client', label: '业主', type: 'text', hint: '如 海康威视；与合同口径一致' },
          { key: 'industry', label: '行业', type: 'text', hint: '如 电子制造 / 食品饮料 / 医药' },
          { key: 'location', label: '地点', type: 'text', hint: '如 浙江杭州' },
          { key: 'area', label: '面积', type: 'text', hint: '如 35,000 ㎡；无据可查留空' },
          { key: 'product', label: '使用产品', type: 'text', hint: '如 ForinCrete SL-ESD' },
          { key: 'year', label: '完工年份', type: 'text', hint: '如 2021' },
          { key: 'img', label: '工程照片', type: 'text', hint: '站内路径 /assets/img/**；留空显示占位块' },
          { key: 'href', label: '详情链接', type: 'url' }
        ]
      }
    },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      options: ['1', '2', '3'],
      default: '3',
      hint: '1 = 一行一条的列表式陈列（图左文右），2/3 = 网格大卡'
    }
  ]
})
</script>

<template>
  <div class="cgrid" :class="data.columns === '2' ? 'cols-2' : data.columns === '1' ? 'cols-1' : 'cols-3'">
    <template v-for="item in data.items || []" :key="item.title">
      <NuxtLink v-if="item.href" class="casecard" :to="item.href">
        <div class="pic">
          <img v-if="item.img" :src="item.img" :alt="`${item.title} 施工现场`" loading="lazy" />
          <span v-else class="ph">工程照片待补</span>
        </div>
        <div class="body">
          <span v-if="item.industry" class="ind">{{ item.industry }}</span>
          <h4>{{ item.title }}</h4>
          <div class="meta">
            <span v-if="item.location">{{ item.location }}</span>
            <span v-if="item.area">{{ item.area }}</span>
            <span v-if="item.year">{{ item.year }}</span>
          </div>
          <span v-if="item.product" class="prod">{{ item.product }}</span>
          <span class="go">查看案例 →</span>
        </div>
      </NuxtLink>
      <div v-else class="casecard">
        <div class="pic">
          <img v-if="item.img" :src="item.img" :alt="`${item.title} 施工现场`" loading="lazy" />
          <span v-else class="ph">工程照片待补</span>
        </div>
        <div class="body">
          <span v-if="item.industry" class="ind">{{ item.industry }}</span>
          <h4>{{ item.title }}</h4>
          <div class="meta">
            <span v-if="item.location">{{ item.location }}</span>
            <span v-if="item.area">{{ item.area }}</span>
            <span v-if="item.year">{{ item.year }}</span>
          </div>
          <span v-if="item.product" class="prod">{{ item.product }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
