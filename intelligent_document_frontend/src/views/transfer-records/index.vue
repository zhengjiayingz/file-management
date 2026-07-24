<template>
  <div class="transfer-records-container">
    <Sidebar />

    <el-container class="main-container">
      <GlobalHeader>
        <template #left>
          <h3>{{ t('transferRecords.title') }}</h3>
        </template>
      </GlobalHeader>

      <el-main class="content-area">
        <div class="filter-bar">
          <FileFilterBar
            :model-value="fileFilters"
            :tag-options="tagOptions"
            @update:model-value="onFileFiltersUpdate"
            @apply="onApplyFilter"
          />
        </div>

        <div class="table-container" v-loading="loading">
          <el-table
            :data="logs || []"
            style="width: 100%"
            border
            stripe
            :header-cell-style="{ background: 'var(--el-fill-color-light)' }"
          >
            <el-table-column prop="id" :label="t('logs.table.id')" width="80" align="center" />

            <el-table-column prop="operationType" :label="t('logs.table.operationType')" width="120" align="center">
              <template #default="{ row }">
                <el-tag :type="getOperationTagType(row.operationType) as any" effect="light">
                  {{ getOperationLabel(row.operationType) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column prop="resourceType" :label="t('logs.table.resourceType')" width="100" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="info">{{ row.resourceType }}</el-tag>
              </template>
            </el-table-column>

            <el-table-column
              prop="description"
              :label="t('logs.table.description')"
              min-width="260"
              show-overflow-tooltip
            />

            <el-table-column prop="ipAddress" :label="t('logs.table.ipAddress')" width="140" align="center" />

            <el-table-column prop="createdAt" :label="t('logs.table.operationTime')" width="180" align="center">
              <template #default="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="pagination-container">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.limit"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            :total="pagination.total"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { logApi } from '@/api/log'
import type { LogItem as OperationLog, LogQueryParams } from '@/types/log'
import type { FileFilterState } from '@typing/fileFilter'
import { defaultFileFilterState } from '@typing/fileFilter'
import type { FileTagItem } from '@typing/file'
import Sidebar from '../index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import FileFilterBar from '@components/FileFilterBar/index.vue'
import fileApiService from '@api/file'

const { t } = useI18n()

const loading = ref(false)
const logs = ref<OperationLog[]>([])
const tagOptions = ref<FileTagItem[]>([])

const fileFilters = reactive<FileFilterState>(defaultFileFilterState())

function onFileFiltersUpdate(v: FileFilterState) {
  Object.assign(fileFilters, v)
}

function onApplyFilter() {
  pagination.page = 1
  loadRecords()
}

const pagination = reactive({
  total: 0,
  page: 1,
  limit: 20
})

function buildQueryParams(): LogQueryParams {
  const params: LogQueryParams = {
    page: pagination.page,
    limit: pagination.limit,
    transferOnly: true,
    sortOrder: 'desc'
  }
  if (fileFilters.q?.trim()) {
    params.q = fileFilters.q.trim()
  }
  if (fileFilters.createdFrom) {
    params.createdFrom = fileFilters.createdFrom
  }
  if (fileFilters.createdTo) {
    params.createdTo = fileFilters.createdTo
  }
  if (fileFilters.type && fileFilters.type !== 'all') {
    params.type = fileFilters.type
  }
  if (fileFilters.entryKind && fileFilters.entryKind !== 'all') {
    params.entryKind = fileFilters.entryKind
  }
  if (fileFilters.tagId != null) {
    params.tagId = fileFilters.tagId
  }
  return params
}

const loadRecords = async () => {
  loading.value = true
  try {
    const res = await logApi.getLogs(buildQueryParams())
    logs.value = res.logs || []
    pagination.total = res.total || 0
    pagination.page = res.page || 1
  } catch (e) {
    console.error(e)
    ElMessage.error(t('transferRecords.loadError'))
  } finally {
    loading.value = false
  }
}

const loadTagOptions = async () => {
  try {
    tagOptions.value = await fileApiService.listFileTags()
  } catch {
    tagOptions.value = []
  }
}

const handleSizeChange = (val: number) => {
  pagination.limit = val
  pagination.page = 1
  loadRecords()
}

const handleCurrentChange = (val: number) => {
  pagination.page = val
  loadRecords()
}

const formatDateTime = (isoString: string) => {
  return new Date(isoString).toLocaleString()
}

const getOperationLabel = (type: string) => {
  const key = `logs.operations.${type}` as `logs.operations.${string}`
  return t(key) || type
}

const getOperationTagType = (type: string) => {
  const map: Record<string, string> = {
    UPLOAD: 'success',
    DOWNLOAD: 'primary'
  }
  return map[type] || ''
}

onMounted(() => {
  loadTagOptions()
  loadRecords()
})
</script>

<style lang="scss" scoped>
.transfer-records-container {
  display: flex;
  height: 100vh;
  background-color: #f5f7fa;
}

.main-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-area {
  flex: 1;
  min-height: 0;
  padding: 20px;
  /* 由 .table-container 内部滚动，避免整页无滚动条却裁切表格 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-bar {
  background: white;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.table-container {
  flex: 1;
  min-height: 0;
  background: white;
  padding: 0;
  border-radius: 8px;
  overflow: auto;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
