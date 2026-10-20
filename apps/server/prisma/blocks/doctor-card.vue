<script setup lang="ts">
/**
 * 医师卡（原型 `.grid-N` + `.doc`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css + site.css 承担。
 *
 * 原型 DOM（见 07-doctors.html / 01-index.html，99-blocks.html `blk-doc`）：
 *   .grid-2 > .doc > (div.top > div.photo > img + div.cap > (div.nm + div.ti))
 *                   + (div.inf > div.rows > div.row*(span.k + span.v) + div.tags > span*)
 *                   + (div.ft > a + span.sh)
 *
 * 数据字段：items[{name, title, dept, certNo, rows[{k,v}], specialties[], avatar, href}]
 *   rows：自定义信息行（首页原型为「从业 / 累计接诊」）；缺省时回退到
 *   「执业证号（certNo）+ 执业专业（dept）」两行的档案口径（列表页用）。
 * 设计稿硬约束：
 * 1. 真人照 4:5 竖版，object-position:top 保证人脸不被裁；
 * 2. 落地页 `08-doctor` 的 H1 由 hero 承载，本块用 div.nm 而非 h1；
 * 3. 不写疗效/排名等违规表述，只做执业信息登记。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'doctor-card',
  name: '医师卡',
  hint: '医师档案卡：真人照 + 执业信息 + 擅长标签',
  fields: [
    { key: 'columns', label: '列数', type: 'select', options: ['2', '3', '4'], default: '2' },
    {
      key: 'items',
      label: '医师',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'name', label: '姓名', type: 'text' },
          { key: 'title', label: '职称', type: 'text' },
          { key: 'dept', label: '执业专业', type: 'text' },
          { key: 'certNo', label: '执业证号', type: 'text' },
          {
            key: 'rows',
            label: '自定义信息行',
            type: 'list',
            hint: '缺省时显示执业证号与执业专业',
            item: {
              type: 'group',
              fields: [
                { key: 'k', label: '名目', type: 'text' },
                { key: 'v', label: '内容', type: 'text' }
              ]
            }
          },
          { key: 'specialties', label: '擅长标签', type: 'list', item: { type: 'text' } },
          { key: 'avatar', label: '照片', type: 'text', hint: '医师照片路径，如 /assets/img/doctor/zhangsan.jpg' },
          {
            key: 'letter',
            label: '无照片字母头像',
            type: 'text',
            hint: '照片缺失时的占位字（如医师姓氏首字）；有 avatar 优先用照片'
          },
          { key: 'href', label: '详情链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="grid" :class="`grid-${data.columns || 2}`">
    <div v-for="doctor in data.items || []" :key="doctor.name" class="doc">
      <div class="top">
        <div class="photo">
          <img v-if="doctor.avatar" :src="doctor.avatar" :alt="`${doctor.name} ${doctor.title || ''}`" loading="lazy" />
          <div v-else-if="doctor.letter" class="ava-letter" aria-hidden="true">
            <span>{{ doctor.letter }}</span>
          </div>
        </div>
        <div class="cap">
          <div class="nm">{{ doctor.name }}</div>
          <div class="ti">{{ [doctor.title, doctor.dept].filter(Boolean).join(' · ') }}</div>
        </div>
      </div>
      <div class="inf">
        <div class="rows">
          <template v-if="doctor.rows?.length">
            <div v-for="row in doctor.rows" :key="row.k" class="row">
              <span class="k">{{ row.k }}</span
              ><span class="v">{{ row.v }}</span>
            </div>
          </template>
          <template v-else>
            <div v-if="doctor.certNo" class="row">
              <span class="k">执业证号</span><span class="v doc-cert">{{ doctor.certNo }}</span>
            </div>
            <div v-if="doctor.dept" class="row">
              <span class="k">执业专业</span><span class="v">{{ doctor.dept }}</span>
            </div>
          </template>
        </div>
        <div v-if="doctor.specialties?.length" class="tags">
          <span v-for="tag in doctor.specialties" :key="tag">{{ tag }}</span>
        </div>
      </div>
      <div v-if="doctor.href" class="ft">
        <NuxtLink :to="doctor.href">查看简介与执业证 →</NuxtLink>
        <span class="sh">持证可核验</span>
      </div>
    </div>
  </div>
</template>

<style>
/* 原型 site.css 未给执业证号设等宽，这里补一处（仅字体，不涉版式） */
.doc .row .v.doc-cert {
  font-family: ui-monospace, Menlo, monospace;
}
</style>
