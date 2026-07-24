<template>
  <el-dialog
    :model-value="modelValue"
    title="解压到当前目录"
    width="560px"
    destroy-on-close
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
  >
    <p class="hint">
      将选中的文件或文件夹解压到当前网盘目录：<strong>{{ currentDirLabel }}</strong>
    </p>
    <el-alert v-if="truncated" type="warning" :closable="false" show-icon class="mb-12">
      压缩包内条目过多，仅展示前 {{ maxListHint }} 条，请直接下载原包处理完整内容。
    </el-alert>
    <div v-loading="loading" class="tree-wrap">
      <el-tree
        v-if="treeData.length"
        ref="treeRef"
        :data="treeData"
        show-checkbox
        node-key="key"
        :props="treeProps"
        default-expand-all
        :check-strictly="false"
      >
        <template #default="{ data }">
          <span class="tree-node">
            <span>{{ data.label }}</span>
            <span v-if="data.size != null && data.size > 0" class="tree-size">{{ formatFileSize(data.size) }}</span>
          </span>
        </template>
      </el-tree>
      <el-empty v-else-if="!loading" description="压缩包内无可用条目" />
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!treeData.length" @click="confirm">
        解压选中项
      </el-button>
    </template>
  </el-dialog>

  <!-- 点击「解压选中项」并检测到重名后再选择处理方式 -->
  <el-dialog
    v-model="conflictDialogVisible"
    title="检测到与网盘文件重名"
    width="520px"
    append-to-body
    destroy-on-close
    @closed="onConflictDialogClosed"
  >
    <p class="conflict-intro">
      以下路径解压后将与当前目录（及已有子文件夹）中的<strong>已有文件</strong>同名，请选择处理方式：
    </p>
    <ul class="conflict-list">
      <li v-for="p in conflictingPaths" :key="p" class="conflict-path">{{ p }}</li>
    </ul>
    <el-radio-group v-model="conflictAction" class="conflict-radios-dialog">
      <el-radio label="suffix">自动重命名（改为「名称(1).ext」等）</el-radio>
      <el-radio label="version">保存为新版本（覆盖并保留历史版本）</el-radio>
      <el-radio label="duplicate">保留两者（两个同名文件并存）</el-radio>
    </el-radio-group>
    <template #footer>
      <el-button @click="conflictDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="confirmConflictExtract">
        确认解压
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { ElTree } from 'element-plus'
import fileApiService from '@api/file'
import { formatFileSize } from '@utils/fileUpload'

export type ArchiveEntry = { path: string; isDirectory: boolean; size: number }

type TreeNode = {
  key: string
  label: string
  children?: TreeNode[]
  size?: number
}

const props = defineProps<{
  modelValue: boolean
  fileId: number
  /** 当前目录名（展示用） */
  currentDirName?: string
  /** 目标父目录 ID，undefined 表示根目录 */
  parentId?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const treeRef = ref<InstanceType<typeof ElTree>>()
const loading = ref(false)
const submitting = ref(false)
const entries = ref<ArchiveEntry[]>([])
const truncated = ref(false)
const maxListHint = 8000

const currentDirLabel = computed(() => props.currentDirName || '根目录')

const treeData = ref<TreeNode[]>([])
const treeProps = { label: 'label', children: 'children' }

const conflictDialogVisible = ref(false)
const conflictingPaths = ref<string[]>([])
const pendingExtractPaths = ref<string[]>([])

/** 仅在出现重名时由用户选择：suffix / version / duplicate */
const conflictAction = ref<'suffix' | 'version' | 'duplicate'>('suffix')

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** 将扁平条目转为 el-tree 数据 */
function buildTree(raw: ArchiveEntry[]): TreeNode[] {
  const sorted = [...raw].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  const findChild = (arr: TreeNode[], label: string) => arr.find((c) => c.label === label)

  const root: TreeNode[] = []
  for (const e of sorted) {
    const clean = e.path.replace(/\/$/, '')
    const parts = clean.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let nodes = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part === undefined) continue
      const isLast = i === parts.length - 1
      const key = isLast ? e.path : `${parts.slice(0, i + 1).join('/')}/`

      let node = findChild(nodes, part)
      if (!node) {
        node = {
          key,
          label: part,
          children: isLast && !e.isDirectory ? undefined : []
        }
        if (isLast && !e.isDirectory) {
          node.size = e.size
        }
        nodes.push(node)
      }
      if (!isLast) {
        if (!node.children) node.children = []
        nodes = node.children
      }
    }
  }
  return root
}

async function loadEntries() {
  loading.value = true
  entries.value = []
  treeData.value = []
  truncated.value = false
  try {
    const data = await fileApiService.listArchiveEntries(props.fileId)
    entries.value = data.entries
    truncated.value = data.truncated
    treeData.value = buildTree(data.entries)
  } catch (err: unknown) {
    const ax = err as { response?: { data?: { message?: string }; status?: number } }
    const msg =
      ax.response?.data?.message ||
      (err instanceof Error ? err.message : '读取压缩包列表失败')
    ElMessage.error(msg)
    emit('update:modelValue', false)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) void loadEntries()
  },
  /** 首次打开时父组件会同时设好 target + v-model=true，子组件一挂载就是 true，默认 watch 不会在挂载时执行，会导致从不请求列表 */
  { immediate: true }
)

function close() {
  emit('update:modelValue', false)
}

/** 仅文件路径，供后端 paths（与 zip 内条目 path 一致，不含尾部 /） */
function collectCheckedFilePaths(): string[] {
  const tree = treeRef.value
  if (!tree) return []
  const leafKeys = new Set((tree.getCheckedKeys(true) as string[]).map((k) => normalizePath(String(k))))
  const out: string[] = []
  for (const e of entries.value) {
    if (e.isDirectory) continue
    const fp = normalizePath(e.path).replace(/\/$/, '')
    if (leafKeys.has(e.path) || leafKeys.has(fp)) out.push(fp)
  }
  return [...new Set(out)]
}

async function runExtract(paths: string[], action: 'suffix' | 'version' | 'duplicate') {
  await fileApiService.extractArchiveToDrive(props.fileId, props.parentId, paths, action)
  ElMessage.success('已解压到当前目录')
  emit('success')
  close()
}

async function confirm() {
  const paths = collectCheckedFilePaths()
  if (paths.length === 0) {
    ElMessage.warning('请至少选择一个文件')
    return
  }
  submitting.value = true
  try {
    const check = await fileApiService.checkArchiveExtractConflicts(props.fileId, props.parentId, paths)
    if (!check.hasConflict) {
      await runExtract(paths, 'suffix')
      return
    }
    conflictingPaths.value = check.conflictingPaths
    pendingExtractPaths.value = paths
    conflictAction.value = 'suffix'
    conflictDialogVisible.value = true
  } catch (err: unknown) {
    const ax = err as { response?: { data?: { message?: string } } }
    const msg = ax.response?.data?.message || (err instanceof Error ? err.message : '检测重名失败')
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

async function confirmConflictExtract() {
  const paths = pendingExtractPaths.value
  if (paths.length === 0) {
    conflictDialogVisible.value = false
    return
  }
  submitting.value = true
  try {
    await runExtract(paths, conflictAction.value)
    conflictDialogVisible.value = false
  } catch (err: unknown) {
    const ax = err as { response?: { data?: { message?: string } } }
    const msg = ax.response?.data?.message || (err instanceof Error ? err.message : '解压失败')
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function onConflictDialogClosed() {
  conflictingPaths.value = []
  pendingExtractPaths.value = []
}
</script>

<style scoped lang="scss">
.hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: #606266;
}

.mb-12 {
  margin-bottom: 12px;
}

.conflict-intro {
  margin: 0 0 10px;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
}

.conflict-list {
  margin: 0 0 14px;
  padding-left: 20px;
  max-height: 140px;
  overflow: auto;
  font-size: 13px;
  color: #303133;
}

.conflict-path {
  word-break: break-all;
  margin-bottom: 4px;
}

.conflict-radios-dialog {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.tree-wrap {
  min-height: 120px;
  max-height: 420px;
  overflow: auto;
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tree-size {
  font-size: 12px;
  color: #909399;
}
</style>
