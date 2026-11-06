<script setup lang="ts">
/**
 * 需求详情、跟进保存及提交 IP 封禁管理弹窗
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { demandsApi, type DemandItem, type DemandStatus } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ demandId: string | null }>()
const emit = defineEmits<{ saved: [] }>()

const { isLoading, run, runKeyed } = useLoading()
const detail = ref<DemandItem | null>(null)
const detailLoading = ref(false)
let detailRequest = 0
const form = reactive<{ status: DemandStatus; note: string }>({ status: 'pending', note: '' })

const contactText = computed(() => {
  if (!detail.value) return []
  return [
    detail.value.phone ? `手机：${detail.value.phone}` : '',
    detail.value.wechat ? `微信：${detail.value.wechat}` : '',
    detail.value.email ? `邮箱：${detail.value.email}` : '',
    detail.value.otherContact ? `其他：${detail.value.otherContact}` : ''
  ].filter(Boolean)
})

async function loadDetail() {
  if (!props.demandId) return
  const demandId = props.demandId
  const request = ++detailRequest
  detailLoading.value = true
  try {
    const result = await demandsApi.detail(demandId)
    if (request !== detailRequest || !visible.value || props.demandId !== demandId) return
    detail.value = result
    form.status = result.status
    form.note = result.note ?? ''
  } finally {
    if (request === detailRequest) detailLoading.value = false
  }
}

watch(visible, (open) => {
  if (!open) {
    detailRequest += 1
    detailLoading.value = false
    return
  }
  detail.value = null
  form.status = 'pending'
  form.note = ''
  void loadDetail()
})

const submit = debounce(
  () =>
    run(async () => {
      if (!detail.value) return
      detail.value = await demandsApi.saveFollowUp(detail.value.id, {
        status: form.status,
        note: form.note.trim()
      })
      ElMessage.success('跟进信息已保存')
      visible.value = false
      emit('saved')
    }),
  DEBOUNCE_WAIT
)

const toggleBan = debounce(
  () =>
    runKeyed('ban', async () => {
      if (!detail.value?.clientIp) return
      if (detail.value.ban) {
        try {
          await ElMessageBox.confirm(`确认解除 IP ${detail.value.clientIp} 的封禁？`, '解除封禁', { type: 'warning' })
        } catch {
          return
        }
        await demandsApi.unbanIp(detail.value.clientIp)
        ElMessage.success('已解除封禁')
      } else {
        let reason = ''
        try {
          const result = await ElMessageBox.prompt('请输入人工封禁原因', `封禁 IP ${detail.value.clientIp}`, {
            inputPlaceholder: '如：持续提交骚扰信息',
            inputPattern: /\S/,
            inputErrorMessage: '请输入封禁原因',
            type: 'warning'
          })
          reason = result.value.trim()
        } catch {
          return
        }
        await demandsApi.banIp({ ip: detail.value.clientIp, reason })
        ElMessage.success('已封禁该 IP')
      }
      await loadDetail()
      emit('saved')
    }),
  DEBOUNCE_WAIT
)
</script>

<template>
  <el-dialog v-model="visible" title="需求详情" width="720px" :close-on-click-modal="false">
    <div v-loading="detailLoading" class="demand-detail">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="站点">{{ detail.siteName || detail.siteId }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">
            <span class="mono">{{ detail.createdAt }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="称呼">{{ detail.contactName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="提交 IP">
            <span class="mono">{{ detail.clientIp || '—' }}</span>
            <el-tag v-if="detail.ban" class="ban-tag" type="danger" effect="plain">已封禁</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="联系方式" :span="2">
            <span v-if="contactText.length">{{ contactText.join('；') }}</span>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="来源页面" :span="2">
            <span class="mono detail-text">{{ detail.sourceUrl || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="需求描述" :span="2">
            <span class="detail-text">{{ detail.description }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.ban" label="封禁原因" :span="2">
            <span class="detail-text">{{ detail.ban.reason }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-form label-width="80px" class="follow-form">
          <el-form-item label="跟进状态">
            <el-radio-group v-model="form.status">
              <el-radio value="pending">待跟进</el-radio>
              <el-radio value="followed">已跟进</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="跟进备注">
            <el-input
              v-model="form.note"
              type="textarea"
              :rows="5"
              maxlength="2000"
              show-word-limit
              placeholder="填写内部跟进备注"
            />
          </el-form-item>
        </el-form>
      </template>
    </div>

    <template #footer>
      <el-button
        v-if="detail?.clientIp"
        :type="detail.ban ? 'default' : 'danger'"
        :loading="isLoading('ban')"
        @click="toggleBan"
      >
        {{ detail.ban ? '解除封禁' : '封禁 IP' }}
      </el-button>
      <span class="footer-spacer" />
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="isLoading()" :disabled="!detail" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.demand-detail {
  min-height: $sp-4;
}

.detail-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ban-tag {
  margin-left: $sp-1;
}

.follow-form {
  margin-top: $sp-2;
}

:deep(.el-dialog__footer) {
  display: flex;
  align-items: center;
}

.footer-spacer {
  flex: 1;
}
</style>
