<script setup lang="ts">
/**
 * 框架块 · 站点页脚（09 §7.1）
 *
 * DOM 与类名对齐设计稿原型 01-index.html（09 §7.4.1 / ADR-036）：
 *   <footer><div class="wrap">
 *     <div class="fgrid">
 *       <div>〈机构名 + 诊疗科目〉</div>
 *       <div><h4>了解机构</h4><ul><li><a>…</a></li></ul></div>
 *        …（footer-1 / footer-2 / footer-3 三列）
 *     </div>
 *     <div class="flegal">〈合规声明 / 工商全称+信用代码+许可证 / NAP / ICP+医保〉</div>
 *   </div></footer>
 * 样式全部来自原型 `theme-b.css`（`footer/.fgrid/.fguide/.flegal`），本组件不写业务样式。
 *
 * 合规是硬要求，不是装饰：
 *   - 工商全称、地址、电话、统一社会信用代码、ICP / 公安备案号必须可见
 *   - 备案号用 `<small>`（法定信息的标准语义）
 *   - 免责声明与隐私 / 版权入口必须可达
 *   - 非医保定点须明示（合规红线）
 *
 * NAP 在页脚出现是**实体一致性**的重要信号：搜索引擎会把页脚的机构信息与正文交叉验证。
 *
 * ⚠️ 与原型一致的顺序：第 1 列是**机构身份**（非导航列），其后才是导航列。
 */
import { ref } from 'vue'
import type { NavigationGroup } from '../../composables/useSite'

/** 二维码约定资产是否可用（默认尝试加载，@error 后置 false 回退占位）；SSR 先占位，hydration 探测 */
const qrOk = ref(false)

/**
 * 页脚导航列标题（**写死**，对齐原型 01-index.html 的 .fgrid 列名）。
 *
 * Why：后台导航分组的默认名是「页脚第 N 列」这类运营占位（shared
 * `NAVIGATION_KEY_LABELS` 的缺省值），漏到站点页脚等于把占位文案直接渲染给
 * 用户；列名属于**站点外观**，归框架块管，不随后台分组名变化。
 * 运营在后台给分组改过名的，仍以后台为准（见 `footerColumnTitle`）。
 */
const FOOTER_COLUMN_TITLES: Record<string, string> = {
  // v3.2 原型页脚（站点/services/index.html .fgrid）；2026-10-14 起仅保留第 1 列兜底名，
  // 就诊服务列（footer-2）已按需求删除
  'footer-1': '机构信息'
}

/** 公众号二维码约定资产（存在则直出 <img>，加载失败回退虚线占位，不新增 Prisma 字段） */
const QRCODE_SRC = '/assets/img/qrcode-official.png'

/** 后台分组的运营占位名（命中即视为未改名，用原型列名替代） */
const GENERIC_COLUMN_TITLES = new Set(['页脚第一列', '页脚第二列', '页脚第三列', '页脚第四列'])

/** 页脚列标题：占位名 → 原型列名；后台已改名的分组原样使用 */
function footerColumnTitle(group: NavigationGroup): string {
  return GENERIC_COLUMN_TITLES.has(group.title) ? (FOOTER_COLUMN_TITLES[group.key] ?? group.title) : group.title
}

defineProps<{
  legalName: string
  commonName: string
  practiceScopes: string[]
  creditCode: string | null
  clinicRegNo: string | null
  issuingAuthority: string | null
  addressFull: string | null
  phone: string | null
  openingHoursText: string | null
  icpNumber: string | null
  policeNumber: string | null
  /** 是否医保定点（false 时须明示「非医保定点」，合规红线） */
  medicalInsurance: boolean
  /** 院内公示的医保口径说明（非定点时的补充说明） */
  insuranceNote: string | null
  groups: NavigationGroup[]
}>()
</script>

<template>
  <footer>
    <div class="wrap">
      <div class="fgrid">
        <!-- 第 1 列：机构身份（原型为固定列，非导航列）；2026-10-14 需求：
             去掉「白癜风专科医疗机构」描述行与来院路线/资质核验/常见问题快捷按钮 -->
        <div>
          <h4>{{ commonName }}</h4>
          <p v-if="practiceScopes.length" style="line-height: 1.95">诊疗科目：{{ practiceScopes.join('／') }}</p>
        </div>

        <!-- 第 2~N 列：页脚导航（独立配置，ADR-029）；列标题写死为原型列名 -->
        <nav v-for="group in groups" :key="group.key" :aria-label="footerColumnTitle(group)">
          <h4>{{ footerColumnTitle(group) }}</h4>
          <ul>
            <li v-for="item in group.items" :key="item.id">
              <NuxtLink :to="item.pagePath || item.href || '/'">{{ item.label }}</NuxtLink>
            </li>
          </ul>
        </nav>

        <!-- 官方公众号二维码位（原型 .fqr；约定资产探测，无图/加载失败回退虚线占位） -->
        <div class="fqr">
          <h4>官方公众号</h4>
          <div class="qr-box">
            <img
              v-if="qrOk"
              :src="QRCODE_SRC"
              alt="西安新城仁爱皮肤病医院官方公众号二维码"
              loading="lazy"
              @error="qrOk = false"
            />
            <span v-else>公众号二维码</span>
          </div>
          <p>扫码关注 · 预约挂号</p>
        </div>
      </div>

      <!-- 法定信息区（原型 .flegal）：合规声明 / 主体标识 / NAP / 备案与医保 -->
      <div class="flegal">
        <div>
          <strong style="color: #a9c2dc">合规声明：</strong
          >本网站内容仅用于医学科普与信息参考，不构成任何诊疗建议；具体诊疗方案请以面诊执业医师意见为准。
          本机构不作出根治、保证治愈、永不复发等承诺，不使用患者对比图，不贬低同行。
        </div>
        <div style="margin-top: 8px">
          {{ commonName }}｜<template v-if="legalName && legalName !== commonName">{{ legalName }}（</template
          ><template v-if="creditCode">统一社会信用代码 {{ creditCode }}</template
          ><template v-if="legalName && legalName !== commonName">）</template
          ><template v-if="clinicRegNo">｜医疗机构执业许可证 {{ clinicRegNo }}</template
          ><template v-if="issuingAuthority">｜发证机关 {{ issuingAuthority }}</template>
        </div>
        <address style="margin-top: 6px; font-style: normal">
          <template v-if="addressFull">{{ addressFull }}</template
          ><template v-if="phone">｜{{ phone }}</template
          ><template v-if="openingHoursText">｜{{ openingHoursText }}</template>
        </address>
        <div style="margin-top: 6px">
          <small v-if="icpNumber">{{ icpNumber }}</small>
          <template v-if="policeNumber"
            ><small>｜{{ policeNumber }}</small></template
          >
          <small>｜医保定点：{{ medicalInsurance ? '是' : '否' }}</small>
          <template v-if="insuranceNote"
            ><small>（{{ insuranceNote }}）</small></template
          >
        </div>
      </div>
    </div>
  </footer>
</template>
