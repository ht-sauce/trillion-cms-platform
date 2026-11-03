<script setup lang="ts">
/**
 * 框架块 · 站点页脚（09 §7.1）
 *
 * 2026-11-03 改版为**单行版权条**：原先是「机构信息列 + 四列导航 + 公众号二维码 +
 * 合规声明大段」的四段式页脚。按最新要求，页脚不承担导航职能（导航入口全在页头），
 * 也不重复公司简介与合规长文 —— 只保留一行：版权主体 · 电话 · ICP 备案号。
 *
 * 为什么仍保留电话与备案号：这是《互联网信息服务管理办法》与工信部备案要求的
 * 页面可见信息，不属于「导航」范畴。备案号在正式上线前配置；未配置时不渲染该段，
 * 页面按「实际站点」的完成态呈现（ADR-050 之后的口径调整）。
 *
 * 为什么不接 practiceScopes / groups / 合规声明：相同信息在「公司简介」与
 * 「联系我们」页已有完整表达，页脚重复一遍只是把页面拉长。
 */
const props = defineProps<{
  /** 对外统一名称（版权主体） */
  commonName: string
  /** 工商全称，有则优先作为版权主体 */
  legalName?: string | null
  /** 对外电话 */
  phone?: string | null
  /** ICP 备案号；未提供时显示占位，不编造编号 */
  icpNumber?: string | null
  /** 企业地址（登记地址）；有值才渲染第二行 */
  addressFull?: string | null
  /** 统一社会信用代码；有值才渲染 */
  creditCode?: string | null
}>()

/** 版权主体：优先工商全称，其次对外名称 */
const owner = computed(() => props.legalName || props.commonName || '')

/** 年份取构建当年（SSG 产物在构建时固化，可接受） */
const year = new Date().getFullYear()

const icp = computed(() => String(props.icpNumber || '').trim())

/**
 * 电话可读化：库里的写法是 `022-27320939`（便于 tel: 与机器抽取），
 * 页面上要显示成行业习惯的 `022-2732 0939`（区号 + 8 位分 4-4）。
 * 匹配不上就原样输出，不做猜测性改写。
 */
const phoneText = computed(() => {
  const raw = String(props.phone || '').trim()
  if (!raw) return ''
  const m = raw.match(/^(0\d{2,3})-?(\d{7,8})$/)
  if (!m) return raw
  const [, area, num] = m
  return num.length === 8 ? `${area}-${num.slice(0, 4)} ${num.slice(4)}` : `${area}-${num}`
})
</script>

<template>
  <footer class="foot">
    <!--
      NAP 行：地址与信用代码（在版权行上方）。
      全站每页可见的统一实体信息是「实体一致性」的地基 —— AI 与搜索引擎做交叉比对时，
      页脚 NAP 是跨页面出现频次最高的信源。字段有值才渲染，缺失时以公司简介页为准。
    -->
    <div v-if="addressFull || creditCode" class="wrap foot-row nap-line">
      <span v-if="addressFull" class="addr">{{ addressFull }}</span>
      <span v-if="addressFull && creditCode" class="dot" aria-hidden="true">·</span>
      <span v-if="creditCode" class="icp">统一社会信用代码 {{ creditCode }}</span>
    </div>
    <div class="wrap foot-row">
      <span class="cpy">© {{ year }} {{ owner }}</span>
      <template v-if="phoneText">
        <span class="dot" aria-hidden="true">·</span>
        <a class="tel" :href="`tel:${phone.replace(/\s/g, '')}`">{{ phoneText }}</a>
      </template>
      <template v-if="icp">
        <span class="dot" aria-hidden="true">·</span>
        <span class="icp">{{ icp }}</span>
      </template>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #0b0d10;
  padding: 18px 0;
}
.foot-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12.4px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.01em;
}
.cpy {
  color: rgba(255, 255, 255, 0.62);
  font-weight: 600;
}
.dot {
  color: rgba(255, 255, 255, 0.26);
}
.tel {
  color: rgba(255, 255, 255, 0.62);
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  text-decoration: none;
}
.tel:hover {
  color: var(--teal);
}
.icp {
  color: rgba(255, 255, 255, 0.42);
}
.nap-line {
  margin-bottom: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
}
.addr {
  color: rgba(255, 255, 255, 0.5);
}
@media (max-width: 640px) {
  .foot-row {
    font-size: 11.5px;
    gap: 6px;
  }
  .nap-line {
    font-size: 11px;
  }
}
</style>
