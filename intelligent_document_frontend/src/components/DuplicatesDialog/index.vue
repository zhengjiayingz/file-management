<template>
  <el-dialog
    :model-value="modelValue"
    width="920px"
    class="duplicates-dialog"
    destroy-on-close
    :title="t('duplicates.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div class="duplicates-toolbar">
      <p class="hint">{{ t('duplicates.hint') }}</p>
      <div class="toolbar-actions">
        <el-button type="primary" :loading="scanning" @click="runScan">
          {{ t('duplicates.scan') }}
        </el-button>
        <el-button
          type="danger"
          :disabled="selectedIds.length === 0"
          :loading="deleting"
          @click="onDeleteSelected"
        >
          {{ t('duplicates.deleteSelected') }} ({{ selectedIds.length }})
        </el-button>
      </div>
    </div>

    <div v-if="summary" class="summary">
      {{
        t('duplicates.summary', {
          files: summary.scannedFileCount,
          exact: summary.exactGroupCount,
        })
      }}
    </div>

    <div v-loading="scanning" class="duplicates-body">
      <el-empty
        v-if="scanned && !scanning && groups.length === 0"
        :description="t('duplicates.empty')"
      />

      <section
        v-for="group in groups"
        :key="group.groupId"
        class="group-card"
      >
        <div class="group-head">
          <el-tag type="danger" size="small">
            {{ t('duplicates.kindExact') }}
          </el-tag>
          <span class="group-count">
            {{ t('duplicates.memberCount', { n: group.members.length }) }}
          </span>
        </div>

        <el-table
          :data="group.members"
          border
          size="small"
          max-height="280"
          @selection-change="
            (rows: DuplicateMember[]) => onGroupSelection(group.groupId, rows)
          "
        >
          <el-table-column type="selection" width="48" />
          <el-table-column
            :label="t('duplicates.colName')"
            min-width="180"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ row.fileName }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('duplicates.colMime')"
            width="130"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ row.mimeType || '—' }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('duplicates.colSize')"
            width="90"
            align="right"
          >
            <template #default="{ row }">
              {{ formatSize(row.fileSize) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('duplicates.colHash')"
            min-width="120"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ row.fileHash ? row.fileHash.slice(0, 12) + '…' : '—' }}
            </template>
          </el-table-column>
        </el-table>
        <p class="group-tip">{{ t('duplicates.keepOneTip') }}</p>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import fileApiService from '@api/file'
import type { DuplicateGroup, DuplicateMember, DuplicatesScanResult } from '@typing/file'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()

const scanning = ref(false)
const deleting = ref(false)
const scanned = ref(false)
const groups = ref<DuplicateGroup[]>([])
const summary = ref<Omit<DuplicatesScanResult, 'groups'> | null>(null)
const selectionByGroup = ref<Record<string, number[]>>({})

const selectedIds = computed(() => {
  const ids = new Set<number>()
  for (const list of Object.values(selectionByGroup.value)) {
    for (const id of list) ids.add(id)
  }
  return [...ids]
})

const formatSize = (n: number | null) => {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const resetState = () => {
  scanning.value = false
  deleting.value = false
  scanned.value = false
  groups.value = []
  summary.value = null
  selectionByGroup.value = {}
}

const onOpen = () => {
  resetState()
}

const runScan = async () => {
  scanning.value = true
  selectionByGroup.value = {}
  try {
    const data = await fileApiService.scanDuplicateFiles()
    groups.value = data?.groups ?? []
    summary.value = {
      scannedFileCount: data?.scannedFileCount ?? 0,
      exactGroupCount: data?.exactGroupCount ?? 0,
    }
    scanned.value = true
    if (groups.value.length === 0) {
      ElMessage.info(t('duplicates.empty'))
    }
  } catch {
    groups.value = []
    summary.value = null
    ElMessage.error(t('duplicates.scanFailed'))
  } finally {
    scanning.value = false
  }
}

const onGroupSelection = (groupId: string, rows: DuplicateMember[]) => {
  selectionByGroup.value = {
    ...selectionByGroup.value,
    [groupId]: rows.map((r) => r.id),
  }
}

const onDeleteSelected = async () => {
  const ids = selectedIds.value
  if (ids.length === 0) return

  for (const g of groups.value) {
    const picked = new Set(selectionByGroup.value[g.groupId] ?? [])
    if (picked.size > 0 && picked.size >= g.members.length) {
      ElMessage.warning(t('duplicates.cannotDeleteAllInGroup'))
      return
    }
  }

  try {
    await ElMessageBox.confirm(
      t('duplicates.deleteConfirm', { n: ids.length }),
      t('duplicates.title'),
      { type: 'warning' },
    )
  } catch {
    return
  }

  deleting.value = true
  try {
    await fileApiService.deleteFilesBatch(ids)
    ElMessage.success(t('duplicates.deleteSuccess'))
    await runScan()
  } catch {
    ElMessage.error(t('duplicates.deleteFailed'))
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.duplicates-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.hint {
  margin: 0;
  max-width: 560px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.summary {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.duplicates-body {
  min-height: 160px;
  max-height: 520px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group-card {
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.group-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.group-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
