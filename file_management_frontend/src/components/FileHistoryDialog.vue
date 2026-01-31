<template>
    <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="历史版本"
        width="600px" @open="loadHistory">
        <div class="history-container">
            <el-alert title="双击记录可预览文件内容" type="info" :closable="false" style="margin-bottom: 10px;" />
            <el-table :data="historyList" v-loading="loading" stripe style="width: 100%" max-height="400"
                @row-dblclick="handleRowDblClick">
                <el-table-column prop="version" label="版本号" width="100" align="center">
                    <template #default="scope">
                        <el-tag size="small">V{{ scope.row.version }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column prop="createdAt" label="保存时间" width="180">
                    <template #default="scope">
                        {{ formatDate(scope.row.createdAt) }}
                    </template>
                </el-table-column>
                <el-table-column prop="fileSize" label="大小" width="100">
                    <template #default="scope">
                        {{ formatFileSize(scope.row.fileSize) }}
                    </template>
                </el-table-column>
                <el-table-column label="操作" align="right">
                    <template #default="scope">
                        <el-tooltip content="将文件恢复到此版本状态" placement="top">
                            <el-popconfirm title="确定要回滚到此版本吗？这将创建一个新的版本。" @confirm="handleRollback(scope.row)"
                                confirm-button-text="确定" cancel-button-text="取消" width="250">
                                <template #reference>
                                    <el-button type="primary" link size="small" :disabled="rollingBack">回滚</el-button>
                                </template>
                            </el-popconfirm>
                        </el-tooltip>
                    </template>
                </el-table-column>
            </el-table>

            <div v-if="historyList.length === 0 && !loading" class="empty-history">
                暂无历史版本记录
            </div>
        </div>

        <template #footer>
            <el-button @click="emit('update:modelValue', false)">关闭</el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import fileApiService from '../api/file'
import { formatFileSize } from '../utils/fileUpload'
import dayjs from 'dayjs'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

const props = defineProps<{
    modelValue: boolean
    fileId?: number
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', val: boolean): void
    (e: 'rollback-success'): void
}>()

interface HistoryItem {
    id: number
    version: number
    fileName: string
    fileSize: number
    createdAt: string
}

const historyList = ref<HistoryItem[]>([])
const loading = ref(false)
const rollingBack = ref(false)

const loadHistory = async () => {
    if (!props.fileId) return
    loading.value = true
    try {
        const list = await fileApiService.getFileVersions(props.fileId)
        historyList.value = list
    } catch (e: any) {
        ElMessage.error('加载历史版本失败: ' + (e.message || '未知错误'))
    } finally {
        loading.value = false
    }
}

const handleRollback = async (item: HistoryItem) => {
    if (!props.fileId) return
    rollingBack.value = true
    try {
        await fileApiService.rollbackVersion(props.fileId, item.id)
        ElMessage.success(`已回滚到版本 V${item.version}`)
        emit('rollback-success')
        emit('update:modelValue', false)
    } catch (e: any) {
        ElMessage.error('回滚失败: ' + (e.message || '未知错误'))
    } finally {
        rollingBack.value = false
    }
}

const handleRowDblClick = (row: HistoryItem) => {
    if (!props.fileId) return
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = authStore.token || ''
    const url = `${API_BASE_URL}/api/files/${props.fileId}/versions/${row.id}/download?token=${token}&preview=true`
    window.open(url, '_blank')
}

const formatDate = (date: string) => {
    return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

watch(() => props.modelValue, (val) => {
    if (val) {
        loadHistory()
    }
})
</script>

<style scoped>
.empty-history {
    text-align: center;
    color: #909399;
    padding: 20px 0;
}
</style>
