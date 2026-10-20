<script setup lang="ts">
/**
 * 动态块数据表单（块代码化的核心：**不再为每种块手写表单**）
 *
 * 数据来源：块源码内 `defineBlock({ fields })` 的声明，由服务端编译期抽取后下发；
 * 本组件只按 `BlockFieldSchema` 递归渲染，新增块 / 改字段无需改后台代码。
 *
 * 递归策略（关键取舍）：`list` 的每个子项统一包装成「单字段表单」`{ v: 子项值 }` 再递归自身，
 * 这样标量列表、对象列表（`item.type = group`）、嵌套列表走的是同一条代码路径，不必为每种组合写一套模板。
 *
 * 对外暴露 `collectMissing()`：父级保存草稿前调用，收集必填但未填的字段标签用于提示。
 */
import type { BlockFieldSchema, BlockFieldType } from '@trillion/shared'

const props = withDefaults(
  defineProps<{
    /** 字段声明（来自块源码抽取） */
    fields: BlockFieldSchema[]
    /** 站内页面候选（link 类型可选路径用） */
    context?: { pages?: { id: string; title: string; path: string }[] }
    /** 列表项标题前缀（递归渲染子项时使用） */
    itemLabelPrefix?: string
  }>(),
  { context: undefined, itemLabelPrefix: '' }
)

const model = defineModel<Record<string, unknown>>({ default: () => ({}) })

/** 控件占位提示 */
function placeholderOf(field: BlockFieldSchema): string {
  if (field.hint) return field.hint
  switch (field.type) {
    case 'url':
      return 'https://'
    case 'link':
      return '如 /about'
    case 'file':
      return '素材 URL，可从素材库复制'
    default:
      return `请输入${field.label}`
  }
}

/** 各类型的空值（新增列表项、字段缺省值兜底） */
function emptyOf(type: BlockFieldType): unknown {
  switch (type) {
    case 'number':
      return 0
    case 'switch':
      return false
    case 'list':
      return []
    case 'group':
      return {}
    default:
      return ''
  }
}

/** 字段当前值：未填时回落到声明默认值，再回落到类型空值 */
function valueOf(field: BlockFieldSchema): unknown {
  const current = model.value[field.key]
  if (current !== undefined && current !== null) return current
  return field.default ?? emptyOf(field.type)
}

function setValue(field: BlockFieldSchema, value: unknown) {
  model.value = { ...model.value, [field.key]: value }
}

/** 文本类控件统一取字符串，避免数字/布尔值灌进 el-input 触发类型告警 */
function textValue(field: BlockFieldSchema): string {
  const value = valueOf(field)
  return value === undefined || value === null ? '' : String(value)
}

/** group 子对象：缺失时给空对象，保证递归表单始终有可写的 model */
function groupModel(field: BlockFieldSchema): Record<string, unknown> {
  const value = valueOf(field)
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// ---------------- list 子项 ----------------

function listOf(field: BlockFieldSchema): unknown[] {
  const value = model.value[field.key]
  return Array.isArray(value) ? value : []
}

/** 子项包装成单字段表单后递归自身：标量 / group / 嵌套 list 共用一条路径 */
function itemField(field: BlockFieldSchema): BlockFieldSchema {
  const item = field.item
  return {
    key: 'v',
    label: '值',
    type: item?.type ?? 'text',
    options: item?.options,
    item: item?.item,
    default: emptyOf(item?.type ?? 'text')
  }
}

function itemModel(value: unknown): Record<string, unknown> {
  return { v: value }
}

function addItem(field: BlockFieldSchema) {
  setValue(field, [...listOf(field), emptyOf(field.item?.type ?? 'text')])
}

function removeItem(field: BlockFieldSchema, index: number) {
  const next = [...listOf(field)]
  next.splice(index, 1)
  setValue(field, next)
}

function moveItem(field: BlockFieldSchema, index: number, direction: 'up' | 'down') {
  const next = [...listOf(field)]
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  setValue(field, next)
}

function setItem(field: BlockFieldSchema, index: number, wrapped: Record<string, unknown>) {
  const next = [...listOf(field)]
  next[index] = wrapped.v
  setValue(field, next)
}

/** 子项显示名：对象子项取首个子字段标签，标量子项用序号 */
function itemTitle(field: BlockFieldSchema, index: number): string {
  return `${props.itemLabelPrefix}${field.label} ${index + 1}`
}

// ---------------- 必填校验 ----------------

/** 是否视为未填（空串 / null / undefined / 空数组都算未填） */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * 收集必填但未填的字段标签（含 group/list 内部一层）
 * 父级保存草稿前调用，用于给出「请先填写：xxx」的汇总提示
 */
function collectMissing(): string[] {
  const missing: string[] = []
  for (const field of props.fields) {
    if (field.required && isBlank(valueOf(field))) missing.push(field.label)
  }
  return missing
}

defineExpose({ collectMissing })
</script>

<template>
  <div class="block-data-form">
    <div v-for="field in fields" :key="field.key" class="field">
      <!-- 标量控件 -->
      <template v-if="field.type !== 'list' && field.type !== 'group'">
        <div class="field-label">
          <span v-if="field.required" class="req">*</span>
          <span>{{ field.label }}</span>
          <span class="type mono">{{ field.type }}</span>
        </div>

        <el-input
          v-if="field.type === 'text'"
          :model-value="textValue(field)"
          :placeholder="placeholderOf(field)"
          @update:model-value="setValue(field, $event)"
        />
        <el-input
          v-else-if="field.type === 'textarea'"
          type="textarea"
          :rows="3"
          :model-value="textValue(field)"
          :placeholder="placeholderOf(field)"
          @update:model-value="setValue(field, $event)"
        />
        <el-input-number
          v-else-if="field.type === 'number'"
          :model-value="Number(valueOf(field) || 0)"
          @update:model-value="setValue(field, $event)"
        />
        <el-switch
          v-else-if="field.type === 'switch'"
          :model-value="Boolean(valueOf(field))"
          @update:model-value="setValue(field, $event)"
        />
        <el-select
          v-else-if="field.type === 'select'"
          :model-value="textValue(field)"
          clearable
          :placeholder="placeholderOf(field)"
          @update:model-value="setValue(field, $event)"
        >
          <el-option v-for="option in field.options || []" :key="option" :label="option" :value="option" />
        </el-select>
        <!-- 站内链接：有页面候选时给下拉（可手填路径），否则退化成输入框 -->
        <el-select
          v-else-if="field.type === 'link' && context?.pages?.length"
          :model-value="textValue(field)"
          clearable
          filterable
          allow-create
          default-first-option
          :placeholder="placeholderOf(field)"
          @update:model-value="setValue(field, $event)"
        >
          <el-option
            v-for="item in context.pages"
            :key="item.id"
            :label="`${item.title}（${item.path}）`"
            :value="item.path"
          />
        </el-select>
        <el-input
          v-else
          :model-value="textValue(field)"
          :placeholder="placeholderOf(field)"
          @update:model-value="setValue(field, $event)"
        />

        <p v-if="field.hint" class="hint">{{ field.hint }}</p>
        <p v-if="field.type === 'file'" class="hint">从素材库选择后粘贴 URL；也可直接填写外部地址</p>
      </template>

      <!-- group：对象子字段，递归自身 -->
      <template v-else-if="field.type === 'group'">
        <div class="field-label">
          <span v-if="field.required" class="req">*</span>
          <span>{{ field.label }}</span>
          <span class="type mono">group</span>
        </div>
        <div class="nested">
          <BlockDataForm
            :model-value="groupModel(field)"
            :fields="field.item?.fields || []"
            :context="context"
            :item-label-prefix="`${itemLabelPrefix}${field.label} · `"
            @update:model-value="setValue(field, $event)"
          />
        </div>
      </template>

      <!-- list：可增删、可上下移的重复项 -->
      <template v-else>
        <div class="field-label">
          <span v-if="field.required" class="req">*</span>
          <span>{{ field.label }}</span>
          <span class="type mono">list</span>
          <span class="spacer" />
          <el-button link size="small" @click="addItem(field)">+ 添加一项</el-button>
        </div>

        <div v-if="!listOf(field).length" class="empty">暂无内容，点击「添加一项」开始录入</div>
        <div v-for="(item, index) in listOf(field)" v-else :key="index" class="list-item">
          <div class="list-head">
            <span class="item-title">{{ itemTitle(field, index) }}</span>
            <span class="spacer" />
            <el-button link size="small" :disabled="index === 0" @click="moveItem(field, index, 'up')">
              上移
            </el-button>
            <el-button
              link
              size="small"
              :disabled="index === listOf(field).length - 1"
              @click="moveItem(field, index, 'down')"
            >
              下移
            </el-button>
            <el-button link size="small" type="danger" @click="removeItem(field, index)">删除</el-button>
          </div>
          <BlockDataForm
            :model-value="itemModel(item)"
            :fields="[itemField(field)]"
            :context="context"
            :item-label-prefix="itemLabelPrefix"
            @update:model-value="setItem(field, index, $event)"
          />
        </div>

        <p v-if="field.hint" class="hint">{{ field.hint }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.block-data-form {
  display: flex;
  flex-direction: column;
  gap: $sp-2;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-size-xs;
  color: $c-text-mute;

  .req {
    color: $c-danger;
  }

  .type {
    font-size: $font-size-xs;
    color: $c-text-faint;
  }

  .spacer {
    flex: 1;
  }
}

.hint {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-faint;
}

.nested {
  padding: $sp-1;
  border-left: 2px solid $c-border-soft;
  background: $c-elevated;
  border-radius: $radius-sm;
}

.list-item {
  padding: $sp-1;
  border: 1px solid $c-border-soft;
  border-radius: $radius-sm;
  background: $c-panel;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .list-head {
    display: flex;
    align-items: center;
    gap: 4px;

    .item-title {
      font-size: $font-size-xs;
      color: $c-text-sub;
    }

    .spacer {
      flex: 1;
    }
  }
}

.empty {
  font-size: $font-size-xs;
  color: $c-text-faint;
  padding: 4px 0;
}
</style>
