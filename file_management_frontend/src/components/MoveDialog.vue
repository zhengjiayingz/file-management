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
import fileApiService from '@api/file'
import type { FileItem } from '@typing/file'

const props = defineProps<{
    modelValue: boolean
    filesToMove: FileItem[]
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
            // 禁用逻辑: 如果文件夹是被移动的那个，我们不应该显示它（或者禁用它）
            // 这里我们直接在后面过滤掉它，但为了UI更友好，也可以显示但disabled
            disabled: props.filesToMove.some(m => m.id === f.id)
        }))

        // 过滤掉已经在 filesToMove列表中的文件夹（防止移动到自己内部 - 简单防止）
        // 注意：这种简单过滤并不能防止移动到自己的子文件夹（如果树展开在移动之前）。
        // 但由于是懒加载，当展示子节点时，如果子节点属于被移动文件夹的子孙，也应该隐藏/禁用。
        // 由于没有完整树结构，很难完全做到。
        // MVP: 至少不能选自己。
        const validFolders = folders.filter(f => !props.filesToMove.some(m => m.id === f.id))

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

    if (props.filesToMove.length === 0) return

    const targetId = selectedFolderId.value === 0 ? undefined : selectedFolderId.value

    try {
        moving.value = true

        // 并行执行移动
        const promises = props.filesToMove.map(file => {
            // 检查是否原位置
            const currentParentId = file.parentId || undefined
            // targetId is undefined for root (0)
            // currentParentId is undefined for root
            // So if equal, skip
            if (currentParentId === targetId) {
                return Promise.resolve()
            }
            return fileApiService.moveFile(file.id, targetId)
        })

        await Promise.all(promises)

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
