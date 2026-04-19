<template>
  <div class="share-access-page">
    <el-card class="card" v-loading="loading">
      <template #header>
        <span>链接分享</span>
      </template>

      <el-alert v-if="errorMsg" type="error" :title="errorMsg" show-icon class="mb-4" />

      <template v-if="!verified && meta">
        <p class="muted">
          共 <strong>{{ meta.itemCount }}</strong> 项
          <span v-if="meta.expireAt">，有效期至 {{ formatExpire(meta.expireAt) }}</span>
        </p>
        <p v-if="needExtractHint" class="hint">请输入提取码后查看并下载文件。</p>
        <el-form @submit.prevent="tryAccess" class="extract-form">
          <el-form-item v-if="needExtractHint" label="提取码">
            <el-input
              v-model="extractInput"
              placeholder="请输入提取码（4 位）"
              clearable
              style="max-width: 240px"
              @keyup.enter="tryAccess"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="tryAccess">
              {{ needExtractHint ? '确认' : '查看文件列表' }}
            </el-button>
          </el-form-item>
        </el-form>
      </template>

      <template v-else>
        <p class="muted">
          分享者：<strong>{{ ownerUsername || '用户' }}</strong>，共 {{ files.length }} 项
        </p>
        <el-table :data="files" stripe size="small" class="file-table">
          <el-table-column prop="fileName" label="名称" min-width="200" show-overflow-tooltip />
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              {{ row.fileType === 'folder' ? '文件夹' : '文件' }}
            </template>
          </el-table-column>
          <el-table-column label="大小" width="110">
            <template #default="{ row }">
              {{ row.fileType === 'folder' ? '—' : formatFileSize(row.size) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.downloadable"
                link
                type="primary"
                @click="downloadOne(row)"
              >
                下载
              </el-button>
              <span v-else class="muted small">文件夹请登录网盘查看</span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <div class="footer-actions">
        <el-button @click="goLogin">登录网盘</el-button>
        <el-button v-if="verified" type="primary" @click="resetView">重新输入提取码</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import {
  getSharePublicMeta,
  accessSharePublic,
  buildShareFileDownloadUrl,
  type SharePublicFileItem
} from '@api/share'
import { formatFileSize } from '@utils/fileUpload'

const route = useRoute()
const router = useRouter()

const shareCode = computed(() => String(route.params.code ?? '').trim())

/** 从链接查询参数读取提取码（与创建分享时 ?e= 一致，并兼容 extractCode） */
function extractFromUrlQuery(query: typeof route.query): string {
  const raw = query.e ?? query.extractCode
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'string') return raw[0].trim()
  return ''
}

/** 将 URL 中的提取码填入输入框（不覆盖用户已手动修改时可按需跳过；此处仅在空或来自 URL 时同步） */
function prefillExtractInputFromUrl() {
  const q = extractFromUrlQuery(route.query)
  if (!q) return
  extractInput.value = q.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const loading = ref(false)
const errorMsg = ref('')
const meta = ref<{ itemCount: number; expireAt: string | null; needExtract: boolean } | null>(null)
const needExtractHint = ref(false)

const verified = ref(false)
const extractInput = ref('')
const effectiveExtract = ref<string | null>(null)
const ownerUsername = ref<string | null>(null)
const files = ref<SharePublicFileItem[]>([])

function formatExpire(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function loadMeta() {
  const code = shareCode.value
  if (!code) {
    errorMsg.value = '链接无效'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const m = await getSharePublicMeta(code)
    meta.value = {
      itemCount: m.itemCount,
      expireAt: m.expireAt,
      needExtract: m.needExtract
    }
    needExtractHint.value = m.needExtract
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const msg = (e.response?.data as { message?: string })?.message
      errorMsg.value = msg || '分享不存在或已失效'
    } else {
      errorMsg.value = '加载失败'
    }
    meta.value = null
  } finally {
    loading.value = false
  }
}

async function tryAccess() {
  const code = shareCode.value
  if (!code) return

  loading.value = true
  errorMsg.value = ''
  try {
    const fromQuery = extractFromUrlQuery(route.query)
    const extract =
      extractInput.value.trim() ||
      fromQuery ||
      (needExtractHint.value ? '' : undefined)

    const data = await accessSharePublic(code, extract)
    effectiveExtract.value = data.extractCode
    ownerUsername.value = data.ownerUsername
    files.value = data.files
    verified.value = true
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const msg = (e.response?.data as { message?: string })?.message
      if (status === 403) {
        errorMsg.value = msg || '提取码错误'
        needExtractHint.value = true
      } else {
        errorMsg.value = msg || '无法打开分享'
      }
    } else {
      errorMsg.value = '请求失败'
    }
  } finally {
    loading.value = false
  }
}

function downloadOne(row: SharePublicFileItem) {
  const code = shareCode.value
  const url = buildShareFileDownloadUrl(code, row.id, effectiveExtract.value || undefined)
  window.open(url, '_blank')
}

function goLogin() {
  const code = shareCode.value
  const e = (
    extractInput.value.trim() ||
    extractFromUrlQuery(route.query) ||
    effectiveExtract.value ||
    ''
  ).trim()
  const target = router.resolve({
    path: `/share-save/${code}`,
    query: e ? { e: e.toUpperCase() } : {}
  })
  router.push({
    path: '/login',
    query: { redirect: target.fullPath }
  })
}

function resetView() {
  verified.value = false
  files.value = []
  effectiveExtract.value = null
  errorMsg.value = ''
  const q = extractFromUrlQuery(route.query)
  extractInput.value = q ? q.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

onMounted(async () => {
  prefillExtractInputFromUrl()
  await loadMeta()
  if (!meta.value && errorMsg.value) return
  prefillExtractInputFromUrl()
  const qe = extractFromUrlQuery(route.query)
  if (!meta.value) return
  if (!meta.value.needExtract) {
    await tryAccess()
  } else if (qe) {
    await tryAccess()
  }
})

watch(
  () => [route.query.e, route.query.extractCode, route.params.code] as const,
  () => {
    if (verified.value) return
    prefillExtractInputFromUrl()
  }
)
</script>

<style scoped>
.share-access-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--el-bg-color-page);
}

.card {
  max-width: 720px;
  width: 100%;
}

.muted {
  color: var(--el-text-color-regular);
}

.hint {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  line-height: 1.6;
  margin: 16px 0 20px;
}

.mb-4 {
  margin-bottom: 16px;
}

.extract-form {
  margin-top: 8px;
}

.file-table {
  margin-top: 12px;
}

.footer-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.small {
  font-size: 12px;
}
</style>