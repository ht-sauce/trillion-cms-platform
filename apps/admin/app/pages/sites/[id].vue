<script setup lang="ts">
/**
 * 站点深入编辑页
 * 单页分区（无 Tab 切换）：基本信息 / 企业资质 / SEO 设置
 * 站点前缀 slug：站点标识 / SSG 产物目录名，同时作为列表「预览」地址前缀
 * 渲染模式暂不在后台暴露（本期纯 SSG）；站点主题色不由后台编辑（服务端默认值兜底）
 * 域名映射：主域名（domain，唯一规范地址）+ 别名域名（domains，可增删，保存时全量提交，见 ADR-022）
 * 营业执照、Logo、Favicon 通过静态文件上传后回填 fileId（URL 与存储解耦）
 */
import { ElMessage } from 'element-plus'
import { filesApi, sitesApi, type SiteItem, type SitePayload } from '~/config/api'
import { DEFAULT_SITE_THEME } from '~/config/site-defaults'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const route = useRoute()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `onSave` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const isNew = computed(() => route.params.id === 'new')

const form = ref<Partial<SiteItem>>({
  name: '',
  slug: '',
  domain: '',
  domains: [],
  companyName: '',
  creditCode: '',
  companyAddress: '',
  contactPhone: '',
  contactEmail: '',
  icpNumber: '',
  policeNumber: '',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  defaultLocale: 'zh-CN',
  renderMode: 'ssg',
  status: 'active',
  robotsPolicy: { allowAllAi: true, blockedAgents: [], extraAllowedAgents: [] },
  /** 站点主题默认值来自 config（与服务端 SITE_DEFAULTS 对齐），页面内不写色值 */
  themeConfig: { ...DEFAULT_SITE_THEME }
})

const logoUrl = ref('')
const faviconUrl = ref('')
const licenseUrl = ref('')

async function load() {
  if (isNew.value) return
  const detail = await sitesApi.detail(String(route.params.id))
  form.value = detail
  logoUrl.value = detail.logoUrl || ''
  faviconUrl.value = detail.faviconUrl || ''
  licenseUrl.value = detail.businessLicenseUrl || ''
}

function onPick(which: 'logo' | 'favicon' | 'license') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    return run(async () => {
      const uploaded = await filesApi.upload(file, isNew.value ? undefined : String(route.params.id))
      if (which === 'logo') {
        form.value.logoFileId = uploaded.id
        logoUrl.value = uploaded.publicUrl
      } else if (which === 'favicon') {
        form.value.faviconFileId = uploaded.id
        faviconUrl.value = uploaded.publicUrl
      } else {
        form.value.businessLicenseFileId = uploaded.id
        licenseUrl.value = uploaded.publicUrl
      }
      ElMessage.success('上传成功')
    })
  }
  input.click()
}

/** 别名域名行：新增 / 删除（纯本地表单行操作，无请求，不需要 loading） */
function addDomain() {
  form.value.domains = [...(form.value.domains ?? []), '']
}

function removeDomain(index: number) {
  form.value.domains = (form.value.domains ?? []).filter((_, i) => i !== index)
}

/** 保存（防抖在外、loading 在内）；别名域名去空格 / 去空值后全量提交，唯一性由服务端校验 */
const onSave = debounce(
  () =>
    run(async () => {
      const payload: SitePayload = {
        ...form.value,
        domains: (form.value.domains ?? []).map((item) => item.trim()).filter(Boolean)
      }
      if (isNew.value) {
        const created = await sitesApi.create(payload)
        ElMessage.success('站点已创建')
        navigateTo(`/sites/${created.id}`)
      } else {
        await sitesApi.update(String(route.params.id), payload)
        ElMessage.success('保存成功')
        await load()
      }
    }),
  DEBOUNCE_WAIT
)

onMounted(load)
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="crumb">站点管理 /</span>
      <span class="panel-title">{{ form.name || (isNew ? '新建站点' : '站点编辑') }}</span>
      <span class="spacer" />
      <el-button size="small" @click="navigateTo('/sites')">返回</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="onSave">保存</el-button>
    </div>

    <div class="panel">
      <div class="body">
        <div class="sec">
          <div class="sec-title">基本信息</div>
          <div class="grid2">
            <div class="field">
              <label>网站名称 *</label>
              <input v-model="form.name" class="inp" />
            </div>
            <div class="field">
              <label><TermHint term="siteSlug" /> *（站点标识 / 产物目录名）</label>
              <input v-model="form.slug" class="inp" placeholder="如 example-site" />
              <p class="tip">
                站点列表「预览」地址 = 主域名 + 站点前缀；本地多个站点共用 localhost:3002 时，靠该前缀区分目标站点
              </p>
            </div>
            <div class="field">
              <label><TermHint term="domain" /> *</label>
              <input v-model="form.domain" class="inp" placeholder="本地开发可填 localhost:3002" />
            </div>
            <div class="field span2">
              <label><TermHint term="aliasDomain" />（可多个；不含主域名）</label>
              <div v-for="(item, index) in form.domains || []" :key="index" class="domain-row">
                <input v-model="form.domains![index]" class="inp" placeholder="如 www.example.com / example.cn" />
                <el-button link size="small" type="danger" @click="removeDomain(index)">删除</el-button>
              </div>
              <el-button link size="small" type="primary" @click="addDomain">+ 添加别名域名</el-button>
              <p class="tip">
                别名域名与主域名一样可访问该站点（SSR 按请求 Host 的主机名匹配，请勿带端口）；sitemap / llms.txt
                等绝对地址仍用主域名
              </p>
            </div>
            <div class="field">
              <label>默认语言</label>
              <input v-model="form.defaultLocale" class="inp" />
            </div>
            <div class="field">
              <label>企业联系电话</label>
              <input v-model="form.contactPhone" class="inp" />
            </div>
            <div class="field">
              <label>企业邮箱</label>
              <input v-model="form.contactEmail" class="inp" />
            </div>
            <div class="field">
              <label>站点状态</label>
              <el-select v-model="form.status" size="small">
                <el-option label="启用" value="active" />
                <el-option label="停用" value="disabled" />
              </el-select>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-title">企业资质</div>
          <div class="grid2">
            <div class="field span2">
              <label>企业名称 *（营业执照全称）</label>
              <input v-model="form.companyName" class="inp" />
            </div>
            <div class="field">
              <label>统一社会信用代码</label>
              <input v-model="form.creditCode" class="inp" />
            </div>
            <div class="field">
              <label>企业地址</label>
              <input v-model="form.companyAddress" class="inp" />
            </div>
            <div class="field">
              <label>ICP 备案号 *</label>
              <input v-model="form.icpNumber" class="inp" />
            </div>
            <div class="field">
              <label>公安备案号</label>
              <input v-model="form.policeNumber" class="inp" />
            </div>
            <div
              v-for="item in [
                { key: 'license', label: '营业执照', url: licenseUrl },
                { key: 'logo', label: '站点 Logo', url: logoUrl },
                { key: 'favicon', label: 'Favicon', url: faviconUrl }
              ]"
              :key="item.key"
              class="field"
            >
              <label>{{ item.label }}</label>
              <div class="uploader" @click="onPick(item.key as 'logo')">
                <img v-if="item.url" :src="item.url" alt="" />
                <span v-else>点击上传 / 预览</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-title">SEO 设置</div>
          <div class="grid2">
            <div class="field span2">
              <label>默认 SEO 标题</label>
              <input v-model="form.seoTitle" class="inp" />
            </div>
            <div class="field span2">
              <label>默认描述（llms.txt 站点摘要复用）</label>
              <input v-model="form.seoDescription" class="inp" />
            </div>
            <div class="field span2">
              <label>默认关键字（逗号分隔）</label>
              <input v-model="form.seoKeywords" class="inp" />
            </div>
            <div class="field span2">
              <label>AI 爬虫策略</label>
              <el-switch v-model="form.robotsPolicy!.allowAllAi" active-text="默认放行全部 AI 爬虫" />
              <p class="tip">关闭后仅放行「额外放行」清单中的爬虫；默认放行是 GEO 关键策略</p>
            </div>
          </div>
        </div>
      </div>

      <div class="foot">提示：备案号将自动渲染到站点页脚；营业执照图片仅后台存档，不对外展示</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .crumb {
    color: $c-text-faint;
    font-size: $font-size-xs;
  }

  .spacer {
    flex: 1;
  }
}

.panel {
  @include panel;
}

.body {
  padding: $sp-2;
}

.sec + .sec {
  margin-top: $sp-2;
  padding-top: $sp-2;
  border-top: 1px solid $c-border-soft;
}

.sec-title {
  margin-bottom: $sp-1;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $c-text;
}

.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $sp-2;
}

.span2 {
  grid-column: span 2;
}

.field label {
  display: block;
  font-size: $font-size-xs;
  color: $c-text-mute;
  margin-bottom: 4px;
}

.inp {
  width: 100%;
  box-sizing: border-box;
  background: $c-input;
  border: 1px solid $c-border;
  border-radius: $radius-md;
  padding: 6px 8px;
  color: $c-text;
  font-size: $font-size-sm;
  outline: none;

  &:focus {
    border-color: $c-primary;
  }
}

.uploader {
  border: 1px dashed $c-border;
  border-radius: $radius-md;
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $c-text-mute;
  font-size: $font-size-xs;
  cursor: pointer;

  img {
    max-height: 68px;
    max-width: 100%;
  }
}

.tip {
  margin: 4px 0 0;
  color: $c-text-faint;
  font-size: $font-size-xs;
}

.domain-row {
  display: flex;
  align-items: center;
  gap: $sp-1;

  & + .domain-row {
    margin-top: 4px;
  }
}

.foot {
  padding: 8px $sp-2;
  border-top: 1px solid $c-border-soft;
  color: $c-text-faint;
  font-size: $font-size-xs;
}
</style>
