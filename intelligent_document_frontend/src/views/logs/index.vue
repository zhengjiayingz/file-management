<template>
    <div class="logs-container">
        <Sidebar />

        <el-container class="main-container">
            <GlobalHeader>
                <template #left>
                    <h3>{{ t('logs.title') }}</h3>
                </template>
            </GlobalHeader>

            <el-main class="content-area">
                <!-- 搜索工具栏（CForm 配置化） -->
                <div class="filter-bar">
                    <CForm class="logs-search-cform" :model="logFilterModel" :fields="logFilterFields"
                        :options="logFilterFormOptions">
                        <template #logsSearchFooter>
                            <div class="filter-footer-buttons">
                                <el-button type="primary" :icon="Search" @click="handleSearch">{{ t('logs.search')
                                    }}</el-button>
                                <el-button @click="resetSearch">{{ t('logs.reset') }}</el-button>
                            </div>
                        </template>
                    </CForm>
                </div>

                <!-- 表格区域 -->
                <div class="table-container" v-loading="loading">
                    <el-table
                        ref="logTableRef"
                        :data="logs || []"
                        style="width: 100%"
                        border
                        stripe
                        :default-sort="{ prop: 'createdAt', order: 'descending' }"
                        :header-cell-style="{ background: 'var(--el-fill-color-light)' }"
                        @sort-change="handleSortChange"
                    >
                        <el-table-column
                            prop="id"
                            :label="t('logs.table.id')"
                            width="80"
                            align="center"
                            sortable="custom"
                        />

                        <el-table-column :label="t('logs.table.operator')" min-width="120" v-if="isAdmin">
                            <template #default="{ row }">
                                <div class="user-cell">
                                    <span class="username">{{ row.user?.username || t('logs.table.unknown') }}</span>
                                    <span class="userid">(ID: {{ row.userId }})</span>
                                </div>
                            </template>
                        </el-table-column>

                        <el-table-column
                            prop="operationType"
                            :label="t('logs.table.operationType')"
                            width="120"
                            align="center"
                            sortable="custom"
                        >
                            <template #default="{ row }">
                                <el-tag :type="getOperationTagType(row.operationType) as any" effect="light">
                                    {{ getOperationLabel(row.operationType) }}
                                </el-tag>
                            </template>
                        </el-table-column>

                        <el-table-column
                            prop="resourceType"
                            :label="t('logs.table.resourceType')"
                            width="120"
                            align="center"
                            sortable="custom"
                        >
                            <template #default="{ row }">
                                <el-tag size="small" type="info">{{ row.resourceType }}</el-tag>
                            </template>
                        </el-table-column>

                        <el-table-column
                            prop="description"
                            :label="t('logs.table.description')"
                            min-width="250"
                            show-overflow-tooltip
                            sortable="custom"
                        />

                        <el-table-column
                            prop="ipAddress"
                            :label="t('logs.table.ipAddress')"
                            width="140"
                            align="center"
                            sortable="custom"
                        />

                        <el-table-column
                            prop="createdAt"
                            :label="t('logs.table.operationTime')"
                            width="180"
                            align="center"
                            sortable="custom"
                        >
                            <template #default="{ row }">
                                {{ formatDateTime(row.createdAt) }}
                            </template>
                        </el-table-column>
                    </el-table>
                </div>

                <!-- 分页 -->
                <div class="pagination-container">
                    <el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.limit"
                        :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper"
                        :total="pagination.total" @size-change="handleSizeChange"
                        @current-change="handleCurrentChange" />
                </div>
            </el-main>
        </el-container>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { ElTable } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { logApi } from '@/api/log'
import type { LogItem as OperationLog, LogQueryParams } from '@/types/log'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import Sidebar from '../index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import CForm from '@components/CForm/index.vue'
import type { CFormFieldItem, CFormOptions } from '@components/CForm/types'

const authStore = useAuthStore()
const { t } = useI18n()

// 状态
const loading = ref(false)
const logs = ref<OperationLog[]>([])
const logTableRef = ref<InstanceType<typeof ElTable>>()

const isAdmin = computed(() => authStore.user?.role === 'admin')

const searchForm = reactive<LogQueryParams>({
    page: 1,
    limit: 20,
    operationType: '',
    keyword: '',
    targetUserId: undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc'
})

/** CForm 筛选模型（与 searchForm 同步字段，日期用范围一项） */
const logFilterModel = reactive<Record<string, unknown>>({
    operationType: '',
    dateRange: null as [string, string] | null,
    keyword: '',
    targetUserId: ''
})

const logOpListKey = 'logOperationTypes'

const logFilterFields = computed<CFormFieldItem[]>(() => {
    const list: CFormFieldItem[] = [
        {
            prop: 'operationType',
            label: t('logs.operationType'),
            type: 'select',
            list: logOpListKey,
            placeholder: t('logs.all'),
            bind: { clearable: true, class: 'logs-filter-control' }
        },
        {
            prop: 'dateRange',
            label: t('logs.dateRange'),
            type: 'daterange',
            bind: {
                rangeSeparator: '-',
                startPlaceholder: t('logs.startDate'),
                endPlaceholder: t('logs.endDate'),
                class: 'logs-filter-control logs-filter-date'
            }
        },
        {
            prop: 'keyword',
            label: t('logs.keyword'),
            type: 'input',
            placeholder: t('logs.searchKeywordPlaceholder'),
            bind: { clearable: true, class: 'logs-filter-control' },
            events: {
                keyup: (...args: unknown[]) => {
                    const e = args[0] as KeyboardEvent
                    if (e?.key === 'Enter') handleSearch()
                }
            }
        }
    ]
    if (isAdmin.value) {
        list.push({
            prop: 'targetUserId',
            label: t('logs.userId'),
            type: 'input',
            placeholder: t('logs.userIdPlaceholder'),
            bind: { clearable: true, class: 'logs-filter-control' },
            events: {
                keyup: (...args: unknown[]) => {
                    const e = args[0] as KeyboardEvent
                    if (e?.key === 'Enter') handleSearch()
                }
            }
        })
    }
    return list
})

const logFilterFormOptions = computed<CFormOptions>(() => ({
    /** 与左侧标签对齐；未设 colSpan 时 columns 才生效（每行 24÷3=8 栅格） */
    labelWidth: '100px',
    labelPosition: 'left',
    columns: 3,
    gutter: 16,
    btnSlotName: 'logsSearchFooter',
    isTrim: false,
    listTypeInfo: {
        [logOpListKey]: [
            { label: t('logs.operations.UPLOAD'), value: 'UPLOAD' },
            { label: t('logs.operations.DOWNLOAD'), value: 'DOWNLOAD' },
            { label: t('logs.operations.DELETE'), value: 'DELETE' },
            { label: t('logs.operations.RESTORE'), value: 'RESTORE' },
            { label: t('logs.operations.PERMANENT_DELETE'), value: 'PERMANENT_DELETE' },
            { label: t('logs.operations.RENAME'), value: 'RENAME' },
            { label: t('logs.operations.MOVE'), value: 'MOVE' }
        ]
    }
}))

function syncLogFilterFromSearchForm() {
    logFilterModel.operationType = searchForm.operationType || ''
    logFilterModel.keyword = searchForm.keyword || ''
    logFilterModel.targetUserId =
        searchForm.targetUserId != null ? String(searchForm.targetUserId) : ''
    logFilterModel.dateRange = null
}

const pagination = reactive({
    total: 0,
    page: 1,
    limit: 20
})

// 方法
const loadLogs = async () => {
    loading.value = true
    try {
        const params = { ...searchForm }
        // 清理空值
        if (!params.operationType) delete params.operationType
        if (!params.keyword) delete params.keyword
        if (!params.targetUserId) delete params.targetUserId
        if (!params.sortBy) params.sortBy = 'createdAt'
        if (!params.sortOrder) params.sortOrder = 'desc'

        const dr = logFilterModel.dateRange as [string, string] | null
        if (dr && dr.length === 2) {
            params.startDate = dr[0]
            params.endDate = dr[1]
        }

        // 映射 operationType 到 type (后端API参数名)
        if (params.operationType) {
            params.type = params.operationType
            delete params.operationType
        }

        const res = await logApi.getLogs(params)

        logs.value = res.logs || []

        pagination.total = res.total || 0
        pagination.page = res.page || 1
        pagination.limit = searchForm.limit || 20 // limit 通常来自请求参数，或者如果是返回的，需要看后端返回结构

        // 更新 searchForm 中的分页状态（可选，如果需要同步）
        // searchForm.page = res.page
    } catch (error) {
        console.error(error)
        ElMessage.error(t('logs.loadError'))
    } finally {
        loading.value = false
    }
}

const handleSearch = () => {
    searchForm.operationType = String(logFilterModel.operationType ?? '')
    searchForm.keyword = String(logFilterModel.keyword ?? '')
    const uid = String(logFilterModel.targetUserId ?? '').trim()
    searchForm.targetUserId = uid ? parseInt(uid, 10) : undefined
    if (uid && Number.isNaN(searchForm.targetUserId!)) {
        searchForm.targetUserId = undefined
    }
    searchForm.page = 1
    loadLogs()
}

const resetSearch = () => {
    searchForm.operationType = ''
    searchForm.keyword = ''
    searchForm.targetUserId = undefined
    searchForm.sortBy = 'createdAt'
    searchForm.sortOrder = 'desc'
    logFilterModel.operationType = ''
    logFilterModel.keyword = ''
    logFilterModel.targetUserId = ''
    logFilterModel.dateRange = null
    nextTick(() => {
        logTableRef.value?.sort('createdAt', 'descending')
    })
    handleSearch()
}

type TableSortOrder = 'ascending' | 'descending' | null

const handleSortChange = (payload: { prop: string; order: TableSortOrder }) => {
    const { prop, order } = payload
    if (!prop) return
    if (!order) {
        searchForm.sortBy = 'createdAt'
        searchForm.sortOrder = 'desc'
        nextTick(() => logTableRef.value?.sort('createdAt', 'descending'))
    } else {
        searchForm.sortBy = prop
        searchForm.sortOrder = order === 'ascending' ? 'asc' : 'desc'
    }
    searchForm.page = 1
    loadLogs()
}

const handleSizeChange = (val: number) => {
    searchForm.limit = val
    loadLogs()
}

const handleCurrentChange = (val: number) => {
    searchForm.page = val
    loadLogs()
}

// 辅助函数
const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString()
}

const getOperationLabel = (type: string) => {
    const key = `logs.operations.${type}` as any
    return t(key) || type
}

const getOperationTagType = (type: string) => {
    const map: Record<string, string> = {
        'UPLOAD': 'success',
        'DOWNLOAD': 'primary',
        'DELETE': 'warning',
        'PERMANENT_DELETE': 'danger',
        'RESTORE': 'info',
        'RENAME': '',
        'MOVE': ''
    }
    return map[type] || ''
}

onMounted(() => {
    syncLogFilterFromSearchForm()
    loadLogs()
})
</script>

<style lang="scss" scoped>
.logs-container {
    display: flex;
    height: 100vh;
    background-color: #f5f7fa;
}

// 复用侧边栏样式
.sidebar {
    background-color: #f8f9fa;
    border-right: 1px solid #e4e7ed;
    display: flex;
    flex-direction: column;

    &-header {
        padding: 20px;
        border-bottom: 1px solid #e4e7ed;

        .logo {
            color: #303133;
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
    }

    &-menu {
        border: none;
        flex: 1;

        .el-menu-item {
            height: 48px;
            line-height: 48px;
        }
    }
}

.main-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.header {
    background: white;
    border-bottom: 1px solid #e4e7ed;
    padding: 0 20px;

    &-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 100%;
    }

    &-left h3 {
        margin: 0;
        font-weight: 500;
        color: #333;
    }

    &-right {
        .user-info {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 14px;
            color: #606266;
        }
    }
}

.content-area {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.filter-bar {
    background: white;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

    @at-root html.dark & {
        background-color: #1d1e1f;
    }
}

.logs-search-cform {
    width: 100%;

    :deep(.el-form) {
        width: 100%;
    }

    :deep(.el-form-item) {
        margin-bottom: 16px;
        margin-right: 0;
    }

    :deep(.el-form-item__content) {
        flex: 1;
        min-width: 0;
    }

    :deep(.logs-filter-control) {
        width: 100%;
        max-width: 100%;
    }

    :deep(.logs-filter-date) {
        min-width: 0;
    }

    /* 底部插槽容器默认 inline-flex 且不占满行，按钮会贴在左侧；拉满整行后再右对齐 */
    :deep(.c-form__footer) {
        width: 100%;
        margin-top: 8px;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        box-sizing: border-box;
    }
}

.table-container {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    flex: 1;
    overflow: auto;

    @at-root html.dark & {
        background-color: #1d1e1f;
    }
}

.pagination-container {
    background: white;
    padding: 15px 20px;
    border-top: 1px solid #ebeef5;
    display: flex;
    justify-content: flex-end;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;

    @at-root html.dark & {
        background-color: #1d1e1f;
        border-top-color: #363637;
    }
}

.user-cell {
    display: flex;
    flex-direction: column;
    line-height: 1.2;

    .userid {
        font-size: 12px;
        color: #909399;
    }
}
.filter-footer-buttons {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
</style>
