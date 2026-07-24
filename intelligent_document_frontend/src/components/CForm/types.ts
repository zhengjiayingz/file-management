/**
 * CForm 配置类型（按步扩展）
 */

import type { Component } from 'vue'
import type { FormInstance, FormItemRule, FormRules } from 'element-plus'

/** 当前支持的表单项类型（后续可继续加） */
export type CFormFieldType =
  | 'input'
  | 'textarea'
  | 'number'
  | 'select'
  | 'select-multiple'
  | 'switch'
  | 'date'
  | 'datetime'
  | 'daterange'
  | 'datetimerange'
  | 'radio'
  | 'checkbox'
  | 'cascader'
  | 'tree-select'
  /**
   * 任意组件：`component` 传入组件对象（建议 `markRaw`）或全局注册名字符串（如 `ElInput`）。
   * 用于 `t-select-table` 等业务组件。
   */
  | 'component'

export interface CFormSelectOption {
  label: string
  value: string | number | boolean
}

/** 透传给具体控件的属性；函数在每次渲染时对应当前 model（便于联动） */
export type CFormFieldBind =
  | Record<string, unknown>
  | ((model: Record<string, unknown>) => Record<string, unknown>)

/** 字段事件回调的固定上下文（始终为最后一个参数） */
export interface CFormFieldEventContext {
  model: Record<string, unknown>
  item: CFormFieldItem
}

/**
 * 绑定到 Element 子组件上的事件（与组件 `emits` 名一致，如 change、blur、clear）。
 * 实际调用顺序：`handler(...组件原生参数, ctx)`。
 */
export type CFormFieldEvents = Record<string, (...args: any[]) => void>

/** 字段插槽作用域参数（与 fx-t-ui `slotName` 配套） */
export interface CFormFieldSlotProps {
  /** 与父组件传入的 `model` 同一引用 */
  model: Record<string, unknown>
  item: CFormFieldItem
}

/** 子插槽：位于 `el-select` 内部，与 fx-t-ui `childSlotName` 配套 */
export interface CFormFieldChildSlotProps extends CFormFieldSlotProps {
  /** 当前项解析后的下拉选项（与内置 `el-option` 数据源一致） */
  options: CFormSelectOption[]
}

/** `el-tree-select` 默认插槽（自定义节点），与 EP Tree 默认插槽一致 */
export interface CFormTreeSelectSlotProps extends CFormFieldSlotProps {
  /** 当前节点数据 */
  data: Record<string, unknown>
  /** 树节点对象（EP 传入，类型随版本可能变化） */
  node?: unknown
}

/** 底部插槽作用域（与 fx-t-ui `btnSlotName` 配套） */
export interface CFormFooterSlotProps {
  model: Record<string, unknown>
  validate: FormInstance['validate']
  resetFields: FormInstance['resetFields']
  clearValidate: FormInstance['clearValidate']
}

/**
 * 具名插槽作用域的并集（字段插槽 / 子插槽 / 底部插槽名均来自配置，无法在 defineSlots 中枚举）。
 * 各插槽只解构自己用到的字段即可。
 */
export type CFormNamedSlotProps = CFormFieldSlotProps & {
  options?: CFormSelectOption[]
} & {
  validate?: FormInstance['validate']
  resetFields?: FormInstance['resetFields']
  clearValidate?: FormInstance['clearValidate']
}

export interface CFormFieldItem {
  /** 对应 el-form-item 的 prop，与 model 的 key 一致 */
  prop: string
  label: string
  type: CFormFieldType
  /**
   * `type === 'component'` 时必填：`component :is` 的目标（组件对象或已注册组件名）。
   */
  component?: string | Component
  /** type 为 select 时下拉选项（与 `list` 二选一或作兜底，见下） */
  options?: CFormSelectOption[]
  /**
   * 引用 `options.listTypeInfo` 中的 key；当字典里该 key 为非空数组时，优先用字典数据。
   * 字典项通过 `optionLabelKey` / `optionValueKey` 映射为 `{ label, value }`。
   */
  list?: string
  /**
   * `type === 'cascader'` 时引用 `formOptions.listTypeInfo` 的 key，值为 `el-cascader` 的 `options` 树。
   * 若不设，使用 `bind.options`。
   */
  cascaderList?: string
  /**
   * `type === 'tree-select'` 时引用 `formOptions.listTypeInfo` 的 key，值为 `el-tree-select` 的 `data` 树（`value` / `label` / `children` 等，与 EP 文档一致）。
   * 若不设，使用 `bind.data`。
   */
  treeSelectList?: string
  /** 字典项展示文案字段，默认 `label`；老数据常用 `dictLabel` */
  optionLabelKey?: string
  /** 字典项取值字段，默认 `value`；老数据常用 `dictValue` */
  optionValueKey?: string
  placeholder?: string
  /** type 为 textarea 时行数 */
  rows?: number
  /**
   * 占栅格列数（1–24），与 Element Plus `el-col` 的 span 一致。
   * 不设时按 `options.columns` 均分一行（24 / columns）。
   */
  colSpan?: number
  /** 该项校验规则，对应 `el-form-item` 的 rules，可与表单级 rules 叠加 */
  rules?: FormItemRule | FormItemRule[]
  /** 透传给该字段对应 Element 组件的额外 props（写在后面的 v-bind 会覆盖前面的默认项） */
  bind?: CFormFieldBind
  /**
   * 是否隐藏该项（不占位）。
   */
  isHideItem?: boolean | ((model: Record<string, unknown>) => boolean)
  /** 见 `CFormFieldEvents`：原生参数后追加 `{ model, item }` */
  events?: CFormFieldEvents
  /** 表单项内容走父组件具名插槽 */
  slotName?: string
  childSlotName?: string
  treeSelectSlotName?: string
  labelSlotName?: string
  labelRender?: CFormLabelRenderFn
  textShow?: boolean
  textValue?: string
  textFormatter?: (model: Record<string, unknown>, item: CFormFieldItem) => string
  isTrim?: boolean
}

/** `labelRender` 的第二个参数 */
export interface CFormLabelRenderContext {
  model: Record<string, unknown>
  item: CFormFieldItem
}

/** `labelRender`：第一个参数为 Vue 的 `h` */
export type CFormLabelRenderFn = (
  h: typeof import('vue').h,
  ctx: CFormLabelRenderContext
) => import('vue').VNodeChild

/** 表单级：布局等，与 el-form 对齐的字段先放这里 */
export interface CFormOptions {
  labelWidth?: string | number
  labelPosition?: 'left' | 'right' | 'top'
  /** 每行展示几个表单项；默认 1（整行一个） */
  columns?: number
  /** `el-row` 栅格间隔（px），默认 16 */
  gutter?: number
  /** 表单级校验规则 */
  rules?: FormRules
  listTypeInfo?: Record<string, unknown[]>
  btnSlotName?: string
  footerStyle?: Record<string, string | number>
  showFooterBtns?: boolean
  footerSubmitText?: string
  footerResetText?: string
  footerShowReset?: boolean
  isTrim?: boolean
}

export interface CFormProps {
  model: Record<string, unknown>
  fields: CFormFieldItem[]
  options?: CFormOptions
}
