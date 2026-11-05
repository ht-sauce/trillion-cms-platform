<script setup lang="ts">
/**
 * 图片字段（输入地址 + 上传 + 预览放大）：
 * 产品 / 案例 / 新闻弹窗共用的单图字段。上传走素材库（filesApi.upload，publicUrl 为 /static/...），
 * 上传成功即回填 v-model；预览用 el-image（可点击放大），地址无效时显示加载失败占位。
 * `source` 用来在素材库里标记「从哪个功能传上来的」（如「新闻 · 封面图」），由各调用点传入。
 */
import { ElMessage } from 'element-plus'
import { MAX_IMAGE_BYTES, filesApi, resolveMediaUrl } from '~/config/api'
import { useLoading } from '~/utils/tool'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    /** 占位提示（站点静态路径示例或留空说明） */
    placeholder?: string
    /** 允许的图片 MIME（缺省常用图片格式） */
    accept?: string
    /** 上传来源标签（写进素材库 source，便于追溯） */
    source?: string
  }>(),
  { placeholder: '/static/... 或点击上传', accept: 'image/jpeg,image/png,image/webp,image/gif', source: '图片字段' }
)

const { loading: uploading, run } = useLoading()
const fileInput = ref<HTMLInputElement>()

/** 素材库返回的 publicUrl 是 /static/...（服务端相对路径），预览需解析为可访问地址 */
const previewUrl = computed(() => resolveMediaUrl(model.value))

function pick() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > MAX_IMAGE_BYTES) {
    ElMessage.warning('图片超过 2MB，请压缩后再上传')
    return
  }
  await run(async () => {
    try {
      const item = await filesApi.upload(file, { source: props.source })
      model.value = item.publicUrl
      ElMessage.success('已上传到素材库')
    } catch {
      /** 错误提示由 http 层统一弹出 */
    }
  })
}
</script>

<template>
  <div class="img-field">
    <el-input v-model="model" :placeholder="placeholder" clearable />
    <slot name="action" />
    <el-button size="small" :loading="uploading" @click="pick">上传</el-button>
    <input ref="fileInput" type="file" :accept="accept" class="hidden-input" @change="onFileChange" />
    <el-image
      v-if="model"
      :src="previewUrl"
      :preview-src-list="[previewUrl]"
      fit="cover"
      preview-teleported
      class="img-preview"
      hide-on-click-modal
    >
      <template #error>
        <div class="img-error">无法加载</div>
      </template>
    </el-image>
  </div>
</template>

<style scoped lang="scss">
.img-field {
  display: flex;
  align-items: center;
  gap: $sp-1;
  width: 100%;

  .el-input {
    flex: 1;
  }
}

.hidden-input {
  display: none;
}

.img-preview {
  width: 64px;
  height: 40px;
  flex: none;
  border-radius: 2px;
  cursor: zoom-in;
}

.img-error {
  width: 64px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
</style>
