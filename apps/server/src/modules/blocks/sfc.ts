/**
 * 块代码（Vue SFC）编译校验与声明抽取
 *
 * 依据 docs/spec/09-site-editor.md §4.2：
 *   1) 用 @vue/compiler-sfc 做 parse → compileScript → compileTemplate → compileStyle（scss）
 *      任一环节失败 → 返回带**行号**的错误，后台编辑器据此标红该行
 *   2) 编译通过后从源码抽取 `defineBlock({ key, name, hint, fields, dataSource })` 声明，
 *      后台据此自动渲染块数据表单（不再为每种块手写表单）
 *
 * ⚠️ 安全边界（ADR-024）：块代码最终会在构建与渲染进程执行，**等价任意代码执行**。
 *    本模块只做「语法与编译校验」，不构成安全沙箱；保存页必须常驻风险提示，
 *    并对 key 白名单、代码体积、落盘文件名做约束（见 blocks.service.ts）。
 *
 * 说明：声明抽取与键名工具统一来自 `@trillion/shared/utils/block-code`，
 *      渲染引擎构建期剥离 `defineBlock` 调用时复用同一实现，避免两端语义漂移。
 */
import type { BlockCompileResult } from '@trillion/shared'
import { BLOCK_KEY_PATTERN, normalizeBlockDeclaration, extractDefineBlockLiteral } from '@trillion/shared'
import { parse, compileScript, compileTemplate, compileStyleAsync } from '@vue/compiler-sfc'

/** 单文件代码体积上限（字节），防止把构建过程拖垮 */
export const BLOCK_CODE_MAX_BYTES = 200 * 1024

// 兼容既有引用（其他模块从本文件导入该常量）
export { BLOCK_KEY_PATTERN }

interface Position {
  line: number
  column: number
}

/** 从 V8 报错栈或编译错误对象中尽力提取行列号 */
function toErrorPosition(error: unknown): Position {
  const message = error instanceof Error ? error.message : String(error)
  const match = /\((\d+):(\d+)\)/.exec(message)
  if (match) return { line: Number(match[1]), column: Number(match[2]) }
  const simple = /(\d+):(\d+)/.exec(message)
  if (simple) return { line: Number(simple[1]), column: Number(simple[2]) }
  return { line: 1, column: 1 }
}

/**
 * 编译校验 + 声明抽取
 * @param code Vue SFC 源码
 * @param filename 用于报错定位的文件名（如 BlkHeroDark.vue）
 */
export async function validateBlockSfc(code: string, filename = 'Block.vue'): Promise<BlockCompileResult> {
  if (typeof code !== 'string' || !code.trim()) {
    return { ok: false, error: { line: 1, column: 1, message: '块代码为空' } }
  }
  if (Buffer.byteLength(code, 'utf8') > BLOCK_CODE_MAX_BYTES) {
    return {
      ok: false,
      error: { line: 1, column: 1, message: `块代码超过体积上限（${Math.round(BLOCK_CODE_MAX_BYTES / 1024)}KB）` }
    }
  }

  const id = `blk-${Date.now().toString(36)}`
  let descriptor: ReturnType<typeof parse>['descriptor']

  try {
    const parsed = parse(code, { filename })
    if (parsed.errors.length) {
      const first = parsed.errors[0] as unknown as Record<string, unknown>
      const loc = (first.loc as { start?: { line: number; column: number } } | undefined)?.start
      return {
        ok: false,
        error: {
          line: loc?.line ?? 1,
          column: loc?.column ?? 1,
          message: String(first.message ?? '解析失败')
        }
      }
    }
    descriptor = parsed.descriptor
  } catch (error) {
    const position = toErrorPosition(error)
    return { ok: false, error: { ...position, message: (error as Error).message } }
  }

  // 脚本编译（<script setup> 的宏与类型擦除）
  try {
    if (descriptor.script || descriptor.scriptSetup) {
      compileScript(descriptor, { id })
    }
  } catch (error) {
    const position = toErrorPosition(error)
    return { ok: false, error: { ...position, message: `脚本编译失败：${(error as Error).message}` } }
  }

  // 模板编译
  try {
    if (descriptor.template?.content) {
      const result = compileTemplate({
        source: descriptor.template.content,
        filename,
        id,
        scoped: descriptor.styles.some((style) => style.scoped)
      })
      if (result.errors.length) {
        const first = result.errors[0]
        const message = typeof first === 'string' ? first : ((first as { message?: string }).message ?? '模板编译失败')
        const position = toErrorPosition(message)
        return { ok: false, error: { ...position, message } }
      }
    }
  } catch (error) {
    const position = toErrorPosition(error)
    return { ok: false, error: { ...position, message: `模板编译失败：${(error as Error).message}` } }
  }

  // 样式编译（scss）：块样式错误会让整站构建失败，必须在保存时就拦住
  for (const style of descriptor.styles) {
    try {
      const result = await compileStyleAsync({
        source: style.content,
        filename,
        id,
        scoped: style.scoped,
        preprocessLang: style.lang as 'scss' | undefined
      })
      if (result.errors.length) {
        const message = String(result.errors[0])
        const position = toErrorPosition(message)
        return { ok: false, error: { ...position, message: `样式编译失败：${message}` } }
      }
    } catch (error) {
      const position = toErrorPosition(error)
      return { ok: false, error: { ...position, message: `样式编译失败：${(error as Error).message}` } }
    }
  }

  // 声明抽取：源码里必须有 defineBlock 调用，否则后台无法生成数据表单
  const setupSource = descriptor.scriptSetup?.content ?? descriptor.script?.content ?? ''
  const literal = extractDefineBlockLiteral(setupSource)
  if (!literal) {
    return {
      ok: false,
      error: { line: 1, column: 1, message: '未找到 defineBlock({...}) 声明：字段声明必须写在块代码内' }
    }
  }

  let raw: Record<string, unknown>
  try {
    // 仅求值已配对的对象字面量（不含 import / 语句），用于读取静态声明
    raw = new Function(`"use strict";return (${literal})`)() as Record<string, unknown>
  } catch (error) {
    const position = toErrorPosition(error)
    return { ok: false, error: { ...position, message: `defineBlock 声明求值失败：${(error as Error).message}` } }
  }

  const declaration = normalizeBlockDeclaration(raw)
  if (!BLOCK_KEY_PATTERN.test(declaration.key)) {
    return {
      ok: false,
      error: { line: 1, column: 1, message: `块标识非法：${declaration.key || '(空)'}，需匹配 ^[a-z][a-z0-9-]{1,40}$` }
    }
  }
  if (!declaration.name) {
    return { ok: false, error: { line: 1, column: 1, message: 'defineBlock 缺少 name（展示名）' } }
  }

  return { ok: true, declaration }
}
