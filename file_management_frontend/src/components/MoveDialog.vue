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

// Watch for dialog opening to reset state if needed
watch(() => props.modelValue, (val) => {
    if (val) {
        selectedFolder.value = null
        selectedFolderId.value = null
    }
})

const loadNode = async (node: any, resolve: (data: any[]) => void) => {
    if (node.level === 0) {
        // Root level: show "Root Folder" or just load top-level folders
        // We can simulate a "Root" node so user can move to root, or just list top level folders.
        // Let's list top level folders, and also provide an option to move to "Root" if we are not at root.
        // Actually, usually the tree itself represents the root.
        // Let's add a virtual "Root" node at the top?
        // Or just load top level folders. If current selection is empty, it means "Root"? 
        // No, users expect to select "Root".
        // Let's return a single root node.
        return resolve([{
            id: 0,
            fileName: '根目录', // Root Directory
            fileType: 'folder'
        }])
    }

    // Load children for a folder
    const parentId = node.data.id === 0 ? undefined : node.data.id
    try {
        const files = await fileApiService.getFiles({ parentId })
        // Filter only folders
        const folders = files.filter(f => f.fileType === 'folder').map(f => ({
            ...f,
            // If the folder is the one being moved, we shouldn't show it (cannot move into itself)
            // Actually we should show it but disable it? Or just hide it to be simple.
            // Move logic: cannot move into itself or its children.
            disabled: props.fileToMove?.id === f.id
        }))

        // further filter out the fileToMove itself if it is a folder
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

    // Check if moving to same location
    // Note: props.fileToMove.parentId might be null, which equals root (0 or undefined)
    const currentParentId = props.fileToMove.parentId || 0
    const targetId = selectedFolderId.value === 0 ? 0 : selectedFolderId.value

    if (currentParentId === targetId) {
        ElMessage.warning('不能移动到原位置')
        return
    }

    try {
        moving.value = true
        // If targetId is 0 (Root), pass undefined or null to API? 
        // API expects number | undefined. 
        // Let's check api/file.ts: moveFile(id, parentId?)
        // If parentId is 0, we should probably pass undefined or null to signify root if backend expects that.
        // In manage.controller.ts: `parentId ? parseInt(parentId) : null`
        // So if we pass 0, typical JS `if (parentId)` is false, so it becomes null -> Root. Reference step 147.
        // Wait, step 147 shows `const data = { parentId: parentId || null }`. If parentId is 0, it becomes null. 
        // So 0 works for root.

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
