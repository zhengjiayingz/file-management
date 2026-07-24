<template>
  <div class="file-filter-bar">
    <CForm class="file-filter-cform" :model="filterModel" :fields="filterFields" :options="cformOptions">
      <template #filterTag>
        <el-select v-if="show('tag')" v-model="filterModel.tagId" clearable filterable class="filter-item filter-tag"
          :placeholder="t('filterBar.tagPlaceholder')">
          <el-option v-for="tag in tagOptions" :key="tag.id" :label="tag.tagName" :value="tag.id">
            <span class="tag-opt">
              <span class="tag-swatch" :style="{ background: tag.color || '#909399' }" />
              {{ tag.tagName }}
            </span>
          </el-option>
        </el-select>
      </template>
      <template #filterBarFooter>
        <div class="filter-footer-buttons">
          <el-button type="primary" class="filter-submit" @click="submit">{{ t('filterBar.query') }}</el-button>
          <el-button v-if="showReset" class="filter-reset" @click="reset">{{ t('filterBar.reset') }}</el-button>
        </div>
      </template>
    </CForm>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileTagItem } from '@typing/file'
import type { FileTypeCategory } from '@typing/file'
import type { FileFilterFeatures, FileFilterState } from '@typing/fileFilter'
import { defaultFileFilterState, defaultFileFilterFeatures } from '@typing/fileFilter'
import CForm from '@components/CForm/index.vue'
import type { CFormFieldItem, CFormOptions } from '@components/CForm/types'

const props = withDefaults(
  defineProps<{
    modelValue: FileFilterState
    tagOptions: FileTagItem[]
    features?: Partial<FileFilterFeatures>
    showReset?: boolean
  }>(),
  {
    showReset: true
  }
)

const emit = defineEmits<{
  'update:modelValue': [FileFilterState]
  apply: []
}>()

const { t } = useI18n()

const merged = computed<FileFilterFeatures>(() => ({
  ...defaultFileFilterFeatures,
  ...props.features
}))

function show(key: keyof FileFilterFeatures): boolean {
  return merged.value[key]
}

function cloneFilter(s: FileFilterState): FileFilterState {
  return {
    q: s.q,
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    type: s.type,
    entryKind: s.entryKind,
    tagId: s.tagId
  }
}

/** CForm 绑定模型（含日期范围合并字段） */
const filterModel = reactive<{
  q: string
  dateRange: [string, string] | null
  type: FileTypeCategory
  entryKind: 'all' | 'file' | 'folder'
  tagId?: number
}>({
  q: '',
  dateRange: null,
  type: 'all',
  entryKind: 'all',
  tagId: undefined
})

function syncFromParent(v: FileFilterState) {
  filterModel.q = v.q ?? ''
  filterModel.type = v.type ?? 'all'
  filterModel.entryKind = v.entryKind ?? 'all'
  filterModel.tagId = v.tagId
  if (v.createdFrom && v.createdTo) {
    filterModel.dateRange = [v.createdFrom, v.createdTo]
  } else {
    filterModel.dateRange = null
  }
}

syncFromParent(props.modelValue)

watch(
  () => props.modelValue,
  (v) => syncFromParent(cloneFilter(v)),
  { deep: true }
)

const listTypeInfo = computed(() => ({
  fileTypes: [
    { label: t('filterBar.typeAll'), value: 'all' },
    { label: t('filterBar.typeImage'), value: 'image' },
    { label: t('filterBar.typeVideo'), value: 'video' },
    { label: t('filterBar.typeAudio'), value: 'audio' },
    { label: t('filterBar.typeDocument'), value: 'document' },
    { label: t('filterBar.typeOther'), value: 'other' }
  ],
  entryKinds: [
    { label: t('filterBar.entryAll'), value: 'all' },
    { label: t('filterBar.entryFile'), value: 'file' },
    { label: t('filterBar.entryFolder'), value: 'folder' }
  ]
}))

const filterFields = computed<CFormFieldItem[]>(() => {
  const list: CFormFieldItem[] = []
  if (show('fileName')) {
    list.push({
      prop: 'q',
      label: t('filterBar.labelFileName'),
      type: 'input',
      placeholder: t('filterBar.fileNamePlaceholder'),
      bind: { clearable: true, class: 'filter-q' }
    })
  }
  if (show('createdRange')) {
    list.push({
      prop: 'dateRange',
      label: t('filterBar.labelDateRange'),
      type: 'daterange',
      bind: {
        unlinkPanels: true,
        rangeSeparator: '—',
        startPlaceholder: t('filterBar.createdFrom'),
        endPlaceholder: t('filterBar.createdTo'),
        class: 'filter-date'
      }
    })
  }
  if (show('fileTypeCategory')) {
    list.push({
      prop: 'type',
      label: t('filterBar.labelType'),
      type: 'select',
      list: 'fileTypes',
      placeholder: t('filterBar.typePlaceholder'),
      bind: { clearable: true, class: 'filter-type' }
    })
  }
  if (show('entryKind')) {
    list.push({
      prop: 'entryKind',
      label: t('filterBar.labelEntry'),
      type: 'select',
      list: 'entryKinds',
      placeholder: t('filterBar.entryKindPlaceholder'),
      bind: { class: 'filter-kind' }
    })
  }
  if (show('tag')) {
    list.push({
      prop: 'tagId',
      label: t('filterBar.labelTag'),
      type: 'select',
      slotName: 'filterTag',
      placeholder: t('filterBar.tagPlaceholder'),
      bind: { class: 'filter-tag' }
    })
  }
  return list
})

const cformOptions = computed<CFormOptions>(() => ({
  /** 中文标签约 4 字，避免换行 */
  labelWidth: '100px',
  labelPosition: 'right',
  /** 每行 3 个表单项（24 栅格 ÷ 3 = 8） */
  columns: 3,
  gutter: 16,
  btnSlotName: 'filterBarFooter',
  footerStyle: { marginTop: '12px' },
  isTrim: false,
  listTypeInfo: listTypeInfo.value
}))

function toFilterState(): FileFilterState {
  const next = defaultFileFilterState()
  next.q = String(filterModel.q ?? '')
  next.type = filterModel.type
  next.entryKind = filterModel.entryKind
  next.tagId = filterModel.tagId
  if (filterModel.dateRange?.length === 2) {
    next.createdFrom = filterModel.dateRange[0]
    next.createdTo = filterModel.dateRange[1]
  }
  return next
}

function submit() {
  const next = toFilterState()
  if (next.type == null || String(next.type) === '') {
    next.type = 'all'
  }
  if (next.entryKind == null || String(next.entryKind) === '') {
    next.entryKind = 'all'
  }
  syncFromParent(next)
  emit('update:modelValue', cloneFilter(next))
  emit('apply')
}

function reset() {
  const cleared = defaultFileFilterState()
  syncFromParent(cleared)
  emit('update:modelValue', cloneFilter(cleared))
  emit('apply')
}
</script>

<style scoped lang="scss">
.file-filter-bar {
  padding: 8px 16px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.file-filter-cform {
  :deep(.el-form-item) {
    margin-bottom: 12px;
    align-items: flex-start;
  }

  :deep(.el-form-item__label) {
    white-space: nowrap;
    line-height: 32px;
    padding-right: 8px;
  }

  :deep(.el-form-item__content) {
    flex: 1;
    min-width: 0;
  }

  :deep(.filter-q),
  :deep(.filter-date),
  :deep(.filter-type),
  :deep(.filter-kind),
  :deep(.filter-tag) {
    width: 100%;
    max-width: 100%;
  }

  :deep(.filter-date) {
    min-width: 0;
  }
}

.filter-item {
  min-width: 140px;
}

.tag-opt {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.filter-submit,
.filter-reset {
  margin-left: 4px;
}

.filter-footer-buttons {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
</style>
