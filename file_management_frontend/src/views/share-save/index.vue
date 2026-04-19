<template>
  <div class="share-save-page">
    <div class="page-head">
      <el-button text type="primary" @click="goBack">← 返回分享页</el-button>
      <h1 class="title">转存分享文件</h1>
    </div>

    <el-card v-loading="loading">
      <template #header>
        <span>勾选要转存到您网盘的文件，然后点击「转存」并选择目标文件夹</span>
      </template>

      <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon class="mb" closable @close="errorMsg = ''" />

      <el-table
        ref="tableRef"
        :data="files"
        border
        stripe
        size="default"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" :selectable="selectableRow" />
        <el-table-column prop="fileName" label="名称" min-width="200" show-overflow-tooltip />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ row.fileType === 'folder' ? '文件夹' : '文件' }}
          </template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">
            {{ row.fileType === 'folder' ? '—' : formatFileSize(row.size) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="footer-actions">
        <el-button
          type="primary"
          size="large"
          :disabled="selectedRows.length === 0"
          :loading="transferring"
          @click="pickerVisible = true"
        >
          转存
        </el-button>
      </div>
    </el-card>

    <ShareFolderPickerDialog v-model="pickerVisible" @confirm="onFolderPicked" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { accessSharePublic, type SharePublicFileItem } from '@api/share'
import fileApiService from '@api/file'
import { formatFileSize } from '@utils/fileUpload'
import ShareFolderPickerDialog from '@components/ShareFolderPickerDialog/index.vue'

const route = useRoute()
const router = useRouter()

const shareCode = computed(() => String(route.params.code ?? '').trim())
const extractFromRoute = computed(() => {
  const e = route.query.e
  return typeof e === 'string' ? e.trim().toUpperCase() : ''
})

const loading = ref(false)
const errorMsg = ref('')
const files = ref<SharePublicFileItem[]>([])
const effectiveExtract = ref<string | null>(null)
const selectedRows = ref<SharePublicFileItem[]>([])
const tableRef = ref<{ clearSelection: () => void } | null>(null)
const pickerVisible = ref(false)
const transferring = ref(false)

function selectableRow(row: SharePublicFileItem) {
  return row.downloadable
}

function onSelectionChange(rows: SharePublicFileItem[]) {
  selectedRows.value = rows
}

function goBack() {
  const code = shareCode.value
  const e = extractFromRoute.value || effectiveExtract.value || ''
  router.push({
    path: `/share/${code}`,
    ...(e ? { query: { e } } : {})
  })
}

async function loadShareFiles() {
  const code = shareCode.value
  if (!code) {
    errorMsg.value = '链接无效'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const extract = extractFromRoute.value || undefined
    const data = await accessSharePublic(code, extract)
    effectiveExtract.value = data.extractCode
    files.value = data.files
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const msg = (e.response?.data as { message?: string })?.message
      errorMsg.value =
        msg ||
        (e.response?.status === 403
          ? '无法访问分享，请从分享页带上提取码后再试'
          : '加载分享失败')
    } else {
      errorMsg.value = '加载失败'
    }
    files.value = []
  } finally {
    loading.value = false
  }
}

async function onFolderPicked(parentId: number | undefined) {
  if (selectedRows.value.length === 0) return
  const code = shareCode.value
  const extract = effectiveExtract.value || extractFromRoute.value || undefined

  pickerVisible.value = false
  transferring.value = true
  let ok = 0
  let fail = 0
  try {
    for (const row of selectedRows.value) {
      if (!row.downloadable) continue
      try {
        await fileApiService.saveSharedFileToMyDrive(row.id, parentId, {
          shareCode: code,
          extractCode: extract || null
        })
        ok++
      } catch (err) {
        console.error(err)
        fail++
      }
    }
  } finally {
    transferring.value = false
  }
  if (ok > 0) {
    ElMessage.success(`已成功转存 ${ok} 个文件${fail ? `，${fail} 个失败` : ''}`)
    tableRef.value?.clearSelection()
    selectedRows.value = []
    await router.push('/')
  } else {
    ElMessage.error('转存失败，请重试')
  }
}

onMounted(() => {
  void loadShareFiles()
})
</script>

<style scoped>
.share-save-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.page-head {
  margin-bottom: 16px;
}

.title {
  margin: 8px 0 0;
  font-size: 20px;
  font-weight: 600;
}

.mb {
  margin-bottom: 16px;
}

.footer-actions {
  margin-top: 20px;
}
</style>
