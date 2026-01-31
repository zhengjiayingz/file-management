<template>
    <el-dialog v-model="dialogVisible" :title="t('file.move.title')" width="500px" @close="handleClose">
        <div class="move-dialog-content">
            <div v-loading="loading">
                <el-tree ref="treeRef" :props="defaultProps" :load="loadNode" lazy highlight-current node-key="id"
                    @current-change="handleCurrentChange" :expand-on-click-node="false">
                    <template #default="{ node, data }">
                        <span class="custom-tree-node">
                            <el-icon class="folder-icon">
                                <Folder />
                            </el-icon>
                            <span>{{ node.label }}</span>
                        </span>
                    </template>
                </el-tree>
            </div>
        </div>
        <template #footer>
            <span class="dialog-footer">
                <el-button @click="handleClose">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="confirmMove" :disabled="!selectedFolder && selectedFolderId !== 0"
                    :loading="moving">
                    {{ t('common.confirm') }}
                </el-button>
            </span>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import fileApiService from '../api/file'
import type { FileItem } from '../types/file'

const props = defineProps<{
    modelValue: boolean
    fileToMove: FileItem | null
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'success'): void
}>()

const { t } = useI18n()
const treeRef = ref()
const loading = ref(false)
const moving = ref(false)
const selectedFolder = ref<any>(null)
const selectedFolderId = ref<number | null>(null)

const dialogVisible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

const defaultProps = {
    label: 'fileName',
    children: 'children',
    isLeaf: 'isLeaf'
}

// 监听弹窗打开以按需重置状态
watch(() => props.modelValue, (val) => {
    if (val) {
        selectedFolder.value = null
        selectedFolderId.value = null
    }
})

const loadNode = async (node: any, resolve: (data: any[]) => void) => {
    if (node.level === 0) {
        // 根目录级别：显示"根目录"或者仅加载顶级文件夹
        // 我们可以模拟一个"根"节点，让用户可以移动到根目录，或者只是列出顶级文件夹。
        // 这里添加一个虚拟的"根"节点在顶部。
        return resolve([{
            id: 0,
            fileName: '根目录', // 根目录
            fileType: 'folder'
        }])
    }

    // 加载文件夹的子节点
    const parentId = node.data.id === 0 ? undefined : node.data.id
    try {
        const files = await fileApiService.getFiles({ parentId })
        // 仅筛选文件夹
        const folders = files.filter(f => f.fileType === 'folder').map(f => ({
            ...f,
            // 如果文件夹是被移动的那个，我们不应该显示它（不能移动到自己内部）
            // 移动逻辑：不能移动到自己或者自己的子文件夹中。
            disabled: props.fileToMove?.id === f.id
        }))

        // 进一步过滤掉 fileToMove 本身（如果它是文件夹）
        const validFolders = folders.filter(f => f.id !== props.fileToMove?.id)

        resolve(validFolders)
    } catch (error) {
        console.error(error)
        resolve([])
    }
}

const handleCurrentChange = (data: any) => {
    selectedFolder.value = data
    selectedFolderId.value = data.id
}

const handleClose = () => {
    emit('update:modelValue', false)
}

const confirmMove = async () => {
    if (selectedFolderId.value === null) {
        ElMessage.warning(t('file.move.selectFolderWarning'))
        return
    }

    if (!props.fileToMove) return

    // 检查是否移动到相同位置
    // 注意：props.fileToMove.parentId 可能为 null，等同于根目录（0 或 undefined）
    const currentParentId = props.fileToMove.parentId || 0
    const targetId = selectedFolderId.value === 0 ? 0 : selectedFolderId.value

    if (currentParentId === targetId) {
        ElMessage.warning('不能移动到原位置')
        return
    }

    try {
        moving.value = true
        // 如果 targetId 是 0 (根目录)，传 undefined 或 null 给 API？
        // API 期望 number | undefined。
        // 让我们检查 api/file.ts: moveFile(id, parentId?)
        // 如果 parentId 是 0，我们应该传 undefined 或 null 来表示根目录。
        // 0 对根目录有效。

        await fileApiService.moveFile(props.fileToMove.id, selectedFolderId.value === 0 ? undefined : selectedFolderId.value)
        ElMessage.success(t('file.move.success'))
        emit('success')
        handleClose()
    } catch (error: any) {
        ElMessage.error(t('file.move.failed') + ': ' + (error.message || '未知错误'))
    } finally {
        moving.value = false
    }
}
</script>

<style scoped>
.move-dialog-content {
    height: 300px;
    overflow-y: auto;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 10px;
}

.custom-tree-node {
    display: flex;
    align-items: center;
    gap: 8px;
}

.folder-icon {
    color: #E6A23C;
}
</style>
