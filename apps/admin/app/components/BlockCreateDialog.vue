<script setup lang="ts">
/**
 * 新建块弹窗：scope（本站块 / 公共模板）+ Vue SFC 源码
 * 块标识 key 由源码内 `defineBlock({ key })` 决定，不由表单填写（服务端抽取后校验唯一性）
 * 保存即编译校验：失败时展示服务端返回的 `compileError`（含行号列号）
 *
 * 归属说明（09 §4.5）：公共块是**模板库**，仅平台级角色可写（模板库页面锁定归属）；
 * 站点块为本站独有，站点引用模板后会自动复制一份本站副本。
 */
import { ElMessage } from 'element-plus'
import { blocksApi, type BlockCompileError, type BlockScope } from '~/config/api'
import { useAuthStore } from '~/stores/auth'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = withDefaults(
  defineProps<{
    /** 归属站点（scope = site 时必填） */
    siteId: string
    /** 预填的源码模板 */
    template?: string
    /** 打开时的默认归属（块模板库传 public） */
    defaultScope?: BlockScope
    /** 锁定归属选择（模板库内只允许新建公共模板） */
    lockScope?: boolean
  }>(),
  { template: '', defaultScope: 'site', lockScope: false }
)
const emit = defineEmits<{ saved: [key: string] }>()

const auth = useAuthStore()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const scope = ref<BlockScope>(props.defaultScope)
const code = ref('')
const error = ref<BlockCompileError | null>(null)

/**
 * 最小可用模板：含 defineBlock 声明与语义化骨架，便于直接改
 * 结束标签必须拼接：SFC 解析见到字面量的脚本结束标签会提前截断脚本块
 */
const SCRIPT_CLOSE = '<' + '/script>'
const DEFAULT_TEMPLATE = `<template>
  <section class="blk">
    <h2>{{ data.title }}</h2>
  </section>
</template>

<script setup lang="ts">
defineBlock({
  key: 'my-block',
  name: '我的块',
  hint: '用途说明',
  fields: [{ key: 'title', label: '标题', type: 'text', required: true }]
})

const props = defineProps<{ data: Record<string, unknown>; context: unknown }>()
${SCRIPT_CLOSE}
`

watch(visible, (open) => {
  if (!open) return
  scope.value = props.defaultScope
  code.value = props.template || DEFAULT_TEMPLATE
  error.value = null
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!code.value.trim()) {
    ElMessage.warning('请填写块源码')
    return
  }

  return run(async () => {
    error.value = null
    try {
      const created = await blocksApi.create({
        scope: scope.value,
        siteId: scope.value === 'site' ? props.siteId : undefined,
        code: code.value
      })
      ElMessage.success(`块已创建：${created.key}`)
      visible.value = false
      emit('saved', created.key)
    } catch (e: unknown) {
      /** 编译详情在响应体 data.compileError（http 层只统一提示 message） */
      const compileError = (e as { data?: { compileError?: BlockCompileError } })?.data?.compileError
      if (compileError) error.value = compileError
    }
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" title="新建块" width="720px">
    <el-form label-width="88px">
      <el-form-item>
        <template #label><TermHint term="blockOwner" /></template>
        <el-select v-model="scope" :disabled="lockScope" style="width: 260px">
          <el-option label="本站块（本站独有）" value="site" />
          <el-option v-if="auth.isPlatformAdmin" label="公共模板（平台级，供各站引入）" value="public" />
        </el-select>
      </el-form-item>
      <el-form-item label="块源码">
        <el-input v-model="code" type="textarea" :rows="16" class="code-input" spellcheck="false" />
      </el-form-item>
    </el-form>

    <p v-if="error" class="compile-error">
      编译失败：{{ error.message }}（第 {{ error.line }} 行，第 {{ error.column }} 列）
    </p>
    <p class="tip">安全提示：块代码等价于任意代码执行，仅可由可信人员提交；标识 key 取自源码内的 defineBlock 声明。</p>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.tip {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-faint;
}

.compile-error {
  margin: 0 0 $sp-1;
  font-size: $font-size-xs;
  color: $c-danger;
}

.code-input :deep(textarea) {
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  line-height: 1.6;
}
</style>
