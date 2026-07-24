<template>
  <el-dialog
    v-model="dialogVisible"
    title="选择保存位置"
    width="500px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="picker-content">
      <div>
        <el-tree
          :props="defaultProps"
          :load="loadNode"
          lazy
          highlight-current
          node-key="id"
          :expand-on-click-node="false"
          @current-change="handleCurrentChange"
        >
          <template #default="{ node, data }">
            <span class="custom-tree-node">
              <el-icon class="folder-icon"><Folder /></el-icon>
              <span>{{ node.label }}</span>
            </span>
          </template>
        </el-tree>
      </div>
    </div>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :disabled="selectedFolderId === null"
        @click="confirmPick"
      >
        确认
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import fileApiService from '@api/file'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', parentId: number | undefined): void
}>()

const selectedFolderId = ref<number | null>(null)

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      selectedFolderId.value = null
    }
  }
)

const defaultProps = {
  label: 'fileName',
  children: 'children',
  isLeaf: 'isLeaf'
}

/** Element Plus lazy Tree 的 load 签名；node 为内部 Node，data 为 TreeNodeData，不宜收窄为 { id: number } */
const loadNode = async (
  node: { level: number; data: { id?: number } },
  resolve: (data: Record<string, unknown>[]) => void,
  _stopLoading?: () => void
) => {
  void _stopLoading
  if (node.level === 0) {
    resolve([
      {
        id: 0,
        fileName: '根目录',
        fileType: 'folder'
      }
    ])
    return
  }
  const nid = node.data?.id
  const parentId = nid === 0 ? undefined : nid
  try {
    const files = await fileApiService.getFiles({ parentId })
    const folders = files
      .filter((f) => f.fileType === 'folder')
      .map((f) => ({ ...f }))
    resolve(folders)
  } catch {
    resolve([])
  }
}

const handleCurrentChange = (data: { id: number } | null) => {
  selectedFolderId.value = data ? data.id : null
}

const handleClose = () => {
  emit('update:modelValue', false)
}

const confirmPick = () => {
  if (selectedFolderId.value === null) {
    ElMessage.warning('请选择一个文件夹')
    return
  }
  const parentId = selectedFolderId.value === 0 ? undefined : selectedFolderId.value
  emit('confirm', parentId)
}
</script>

<style scoped>
.picker-content {
  height: 320px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 10px;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
}

.folder-icon {
  color: #e6a23c;
}
</style>
