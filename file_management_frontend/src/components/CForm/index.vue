<template>
  <el-form
    ref="innerFormRef"
    class="c-form"
    :class="{ 'c-form--label-top': labelPosition === 'top' }"
    v-bind="attrs"
    :model="formModel"
    :rules="formRules"
    :label-width="labelWidth"
    :label-position="labelPosition"
  >
    <el-row :gutter="rowGutter">
      <template v-for="item in fields" :key="item.prop">
        <el-col v-if="!isFieldHidden(item)" :span="spanFor(item)">
          <el-form-item
            :label="formItemLabel(item)"
            :prop="item.prop"
            :rules="item.rules"
            :class="formItemClassObject(item)"
          >
            <template v-if="item.labelSlotName" #label>
              <slot
                :name="item.labelSlotName"
                :model="formModel"
                :item="item"
              />
            </template>
            <template v-else-if="item.labelRender" #label>
              <CFormLabelRender
                :render-fn="item.labelRender"
                :model="formModel"
                :item="item"
              />
            </template>
            <template v-if="item.slotName">
              <slot
                :name="item.slotName"
                :model="formModel"
                :item="item"
              />
            </template>
            <template v-else-if="item.textShow">
              <span class="c-form__text-value">{{ displayTextFor(item) }}</span>
            </template>
            <template v-else-if="item.type === 'input'">
              <el-input
                v-model="formModel[item.prop]"
                :placeholder="item.placeholder"
                clearable
                style="width: 100%"
                v-bind="fieldBind(item)"
                v-on="mergedInputEvents(item)"
              />
            </template>
            <template v-else-if="item.type === 'textarea'">
              <el-input
                v-model="formModel[item.prop]"
                type="textarea"
                :rows="item.rows ?? 3"
                :placeholder="item.placeholder"
                style="width: 100%"
                v-bind="fieldBind(item)"
                v-on="mergedInputEvents(item)"
              />
            </template>
            <template v-else-if="item.type === 'number'">
              <el-input-number
                v-model="formModel[item.prop] as number | undefined"
                :placeholder="item.placeholder"
                style="width: 100%"
                v-bind="fieldBind(item)"
                v-on="fieldEvents(item)"
              />
            </template>
            <template v-else-if="isSelectLikeType(item.type)">
              <el-select
                v-model="formModel[item.prop]"
                :multiple="item.type === 'select-multiple'"
                :placeholder="item.placeholder"
                clearable
                filterable
                style="width: 100%"
                v-bind="fieldBind(item)"
                v-on="fieldEvents(item)"
              >
                <template v-if="item.childSlotName && !item.slotName">
                  <slot
                    :name="item.childSlotName"
                    :model="formModel"
                    :item="item"
                    :options="selectOptionsFor(item)"
                  />
                </template>
                <template v-else>
                  <el-option
                    v-for="opt in selectOptionsFor(item)"
                    :key="String(opt.value)"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </template>
              </el-select>
            </template>
            <template v-else-if="item.type === 'radio'">
              <el-radio-group
                v-model="formModel[item.prop]"
                v-bind="fieldBind(item)"
                v-on="fieldEvents(item)"
              >
                <el-radio
                  v-for="opt in selectOptionsFor(item)"
                  :key="String(opt.value)"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </el-radio>
              </el-radio-group>
            </template>
            <template v-else-if="item.type === 'checkbox'">
              <el-checkbox-group
                v-model="formModel[item.prop]"
                v-bind="fieldBind(item)"
                v-on="fieldEvents(item)"
              >
                <el-checkbox
                  v-for="opt in selectOptionsFor(item)"
                  :key="String(opt.value)"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </el-checkbox>
              </el-checkbox-group>
            </template>
            <template v-else-if="item.type === 'cascader'">
              <el-cascader
                v-model="formModel[item.prop]"
                clearable
                style="width: 100%"
                v-bind="fieldBind(item)"
                :options="cascaderOptionsFor(item)"
                :placeholder="item.placeholder ?? '请选择'"
                v-on="fieldEvents(item)"
              />
            </template>
            <template v-else-if="item.type === 'switch'">
              <el-switch
                v-model="formModel[item.prop] as boolean"
                v-bind="fieldBind(item)"
                v-on="fieldEvents(item)"
              />
            </template>
            <template v-else-if="isDatePickerFieldType(item.type)">
              <el-date-picker
                v-model="formModel[item.prop]"
                :type="elDatePickerType(item)"
                :placeholder="item.placeholder ?? datePlaceholder(item)"
                style="width: 100%"
                v-bind="datePickerMergeBind(item)"
                v-on="fieldEvents(item)"
              />
            </template>
            <template v-else-if="item.type === 'tree-select'">
              <el-tree-select
                v-model="formModel[item.prop]"
                clearable
                filterable
                :render-after-expand="false"
                style="width: 100%"
                v-bind="fieldBind(item)"
                :data="treeSelectDataFor(item)"
                :placeholder="item.placeholder ?? '请选择'"
                v-on="fieldEvents(item)"
              >
                <template v-if="item.treeSelectSlotName" #default="treeScope">
                  <slot
                    :name="item.treeSelectSlotName"
                    :model="formModel"
                    :item="item"
                    :data="treeScope.data"
                    :node="treeScope.node"
                  />
                </template>
              </el-tree-select>
            </template>
            <template v-else-if="item.type === 'component'">
              <component
                :is="item.component"
                v-if="item.component != null"
                v-model="formModel[item.prop]"
                style="width: 100%"
                v-bind="fieldBind(item)"
                v-on="fieldEvents(item)"
              />
            </template>
          </el-form-item>
        </el-col>
      </template>
    </el-row>
    <div
      v-if="showFooter"
      class="c-form__footer"
      :style="footerStyle"
    >
      <slot
        v-if="btnSlotName"
        :name="btnSlotName"
        :model="formModel"
        :validate="runValidate"
        :reset-fields="runResetFields"
        :clear-validate="runClearValidate"
      />
      <div
        v-else-if="showFooterBtnsFlag"
        class="c-form__footer-btns"
      >
        <el-button type="primary" @click="onBuiltInSubmit">
          {{ footerSubmitLabel }}
        </el-button>
        <el-button v-if="footerShowReset" @click="runResetFields">
          {{ footerResetLabel }}
        </el-button>
      </div>
    </div>
  </el-form>
</template>

<script setup lang="ts">
import { computed, ref, toRef, useAttrs } from 'vue'
import type { FormInstance } from 'element-plus'
import CFormLabelRender from './label-render.vue'
import {
  elDatePickerType,
  isDatePickerFieldType,
  isSelectLikeType,
  defaultValueFormatForDateType,
} from './control-utils'
import type {
  CFormFieldEventContext,
  CFormFieldItem,
  CFormProps,
  CFormSelectOption,
} from './types'

defineOptions({ name: 'CForm', inheritAttrs: false })

/** 透传到根 `el-form`：未在 `CFormProps` 中声明的属性与监听（如 `disabled`、`size`、`inline`、`scroll-to-error` 及 `@validate` 等） */
const attrs = useAttrs()

/** 具名插槽名来自配置，无法用精确联合描述；用 any 避免 Volar 将多插槽作用域误并为一种形状 */
defineSlots<Record<string, (props: any) => any>>()

// 父组件传进来的所有 prop的集合，props：Vue 用来装所有 prop 的容器对象。
const props = withDefaults(defineProps<CFormProps>(), {
  options: undefined
})

const emit = defineEmits<{
  /** 内置底部「提交」在校验通过后触发，参数为当前 `model` 引用 */
  submit: [model: Record<string, unknown>]
}>()

const fields = computed(() => props.fields)

/** 与父组件 :model 传入对象为同一引用，供 el-form 校验 / resetFields 使用 */
const formModel = toRef(props, 'model')

const innerFormRef = ref<FormInstance>()

const labelWidth = computed(() => props.options?.labelWidth)
const labelPosition = computed(() => props.options?.labelPosition ?? 'right')

const formRules = computed(() => props.options?.rules)

const btnSlotName = computed(() => props.options?.btnSlotName)
const showFooterBtnsFlag = computed(() => props.options?.showFooterBtns === true)
const showFooter = computed(
  () => Boolean(btnSlotName.value) || showFooterBtnsFlag.value
)
const footerStyle = computed(() => props.options?.footerStyle)
const footerSubmitLabel = computed(() => props.options?.footerSubmitText ?? '提交')
const footerResetLabel = computed(() => props.options?.footerResetText ?? '重置')
const footerShowReset = computed(() => props.options?.footerShowReset !== false)

const rowGutter = computed(() => props.options?.gutter ?? 16)

/** 每行表单项数量，至少为 1 */
const columns = computed(() => {
  const n = props.options?.columns ?? 1
  return n >= 1 ? n : 1
})

function spanFor(item: (typeof props.fields)[number]) {
  if (item.colSpan != null) {
    return Math.min(24, Math.max(1, item.colSpan))
  }
  /** 未写 colSpan 时按 `options.columns` 均分 24 栅格（与模板里 `:span="spanFor(item)"` 对应） */
  return Math.floor(24 / columns.value) || 24
}

function fieldBind(item: CFormFieldItem): Record<string, unknown> {
  const b = item.bind
  if (b == null) return {}
  if (typeof b === 'function') return b(props.model)
  return b
}

function isFieldHidden(item: CFormFieldItem): boolean {
  const h = item.isHideItem
  if (h == null) return false
  if (typeof h === 'function') return h(props.model)
  return h
}

/** 自定义 label 时不再传字符串 `label`，避免与 `#label` 插槽重复 */
function formItemLabel(item: CFormFieldItem): string | undefined {
  if (item.labelSlotName != null || item.labelRender != null) return undefined
  return item.label
}

function formItemClassObject(item: CFormFieldItem): Record<string, boolean> {
  return {
    slot_label: Boolean(item.slotName),
    render_label: Boolean(item.labelSlotName != null || item.labelRender != null),
  }
}

function displayTextFor(item: CFormFieldItem): string {
  if (typeof item.textFormatter === 'function') {
    return item.textFormatter(props.model, item)
  }
  if (item.textValue != null && item.textValue !== '') {
    return item.textValue
  }
  const v = props.model[item.prop]
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

const trimGloballyOn = computed(() => props.options?.isTrim !== false)

function trimEnabledForField(item: CFormFieldItem, control: 'input' | 'textarea'): boolean {
  if (!trimGloballyOn.value) return false
  if (item.isTrim === true) return false
  const b =
    typeof item.bind === 'function' ? item.bind(props.model) : item.bind ?? {}
  if (control === 'input') {
    const t = b.type
    if (t === 'password' || t === 'number') return false
  }
  return true
}

function wrapInputEventWithTrim(
  orig: ((...args: unknown[]) => void) | undefined,
  item: CFormFieldItem
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    const v = props.model[item.prop]
    if (typeof v === 'string') {
      props.model[item.prop] = v.trim()
    }
    orig?.(...args)
  }
}

/** `input` / `textarea` 合并 trim 与用户 `events` */
function mergedInputEvents(item: CFormFieldItem): Record<string, (...args: unknown[]) => void> {
  const base = fieldEvents(item)
  const control: 'input' | 'textarea' = item.type === 'textarea' ? 'textarea' : 'input'
  if (!trimEnabledForField(item, control)) return base
  return {
    ...base,
    change: wrapInputEventWithTrim(base.change, item),
    blur: wrapInputEventWithTrim(base.blur, item),
  }
}

function datePlaceholder(item: CFormFieldItem): string {
  switch (item.type) {
    case 'daterange':
    case 'datetimerange':
      return '选择日期范围'
    case 'datetime':
      return '选择日期时间'
    default:
      return '选择日期'
  }
}

function datePickerMergeBind(item: CFormFieldItem): Record<string, unknown> {
  const b = { ...fieldBind(item) }
  if (b.valueFormat == null && b['value-format'] == null) {
    const vf = defaultValueFormatForDateType(item.type)
    if (vf != null) b.valueFormat = vf
  }
  return b
}

function cascaderOptionsFor(item: CFormFieldItem): unknown[] {
  if (item.type !== 'cascader') return []
  const key = item.cascaderList
  if (key != null) {
    const raw = props.options?.listTypeInfo?.[key]
    if (Array.isArray(raw)) return raw
  }
  const b = fieldBind(item)
  const o = b.options
  return Array.isArray(o) ? o : []
}

/** `el-tree-select` 的 `data`：`treeSelectList` → listTypeInfo，否则 `bind.data` */
function treeSelectDataFor(item: CFormFieldItem): unknown[] {
  if (item.type !== 'tree-select') return []
  const key = item.treeSelectList
  if (key != null) {
    const raw = props.options?.listTypeInfo?.[key]
    if (Array.isArray(raw)) return raw
  }
  const b = fieldBind(item)
  const d = b.data
  return Array.isArray(d) ? d : []
}

/**
 * select / select-multiple / radio / checkbox 选项：`list` + `listTypeInfo` 优先；否则 `options`。
 */
function selectOptionsFor(item: CFormFieldItem): CFormSelectOption[] {
  if (
    item.type !== 'select' &&
    item.type !== 'select-multiple' &&
    item.type !== 'radio' &&
    item.type !== 'checkbox'
  ) {
    return []
  }
  const lkey = item.list
  const dict = props.options?.listTypeInfo
  if (lkey != null && dict != null) {
    const raw = dict[lkey]
    if (Array.isArray(raw) && raw.length > 0) {
      return mapRowsToSelectOptions(
        raw,
        item.optionLabelKey ?? 'label',
        item.optionValueKey ?? 'value'
      )
    }
  }
  return item.options ?? []
}

function mapRowsToSelectOptions(
  rows: unknown[],
  labelKey: string,
  valueKey: string
): CFormSelectOption[] {
  const out: CFormSelectOption[] = []
  for (const row of rows) {
    if (row != null && typeof row === 'object') {
      const o = row as Record<string, unknown>
      const v = o[valueKey]
      out.push({
        label: String(o[labelKey] ?? ''),
        value: (v ?? '') as string | number | boolean,
      })
      continue
    }
    out.push({ label: String(row), value: row as string | number | boolean })
  }
  return out
}

/** 将配置里的 events 转成 v-on 对象；回调末尾追加 `{ model, item }` */
function fieldEvents(item: CFormFieldItem): Record<string, (...args: unknown[]) => void> {
  const map = item.events
  if (map == null || typeof map !== 'object') return {}
  const ctx: CFormFieldEventContext = { model: props.model, item }
  const out: Record<string, (...args: unknown[]) => void> = {}
  for (const key of Object.keys(map)) {
    const fn = map[key]
    if (typeof fn !== 'function') continue
    // 组件触发时先把「原生参数」原样传给用户，最后再拼上 ctx，把model和item传给用户
    out[key] = (...args: unknown[]) => fn(...args, ctx)
  }
  return out
}

function runValidate(callback?: Parameters<FormInstance['validate']>[0]) {
  const f = innerFormRef.value
  if (!f) {
    return Promise.reject(new Error('CForm: form ref not ready'))
  }
  return f.validate(callback)
}

function runResetFields() {
  innerFormRef.value?.resetFields()
}

function runClearValidate(propsArg?: string | string[]) {
  innerFormRef.value?.clearValidate(propsArg)
}

async function onBuiltInSubmit() {
  try {
    await runValidate()
    emit('submit', props.model)
  } catch {
    /* el-form 校验未通过 */
  }
}

defineExpose({
  validate: (callback?: Parameters<FormInstance['validate']>[0]) =>
    innerFormRef.value?.validate(callback),
  resetFields: () => innerFormRef.value?.resetFields(),
  clearValidate: (propsArg?: string | string[]) =>
    innerFormRef.value?.clearValidate(propsArg),
})
</script>

<style lang="scss" scoped>
.c-form {
  width: 100%;
}

.c-form__footer {
  width: 100%;
  margin-top: 16px;
}

.c-form__footer-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.c-form__text-value {
  color: var(--el-text-color-regular, #606266);
  line-height: 32px;
  word-break: break-word;
}

.c-form :deep(.render_label .el-form-item__label) {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.c-form.c-form--label-top :deep(.render_label .el-form-item__label) {
  justify-content: flex-start;
}
</style>
