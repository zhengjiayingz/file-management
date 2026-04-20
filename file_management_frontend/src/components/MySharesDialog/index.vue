<template>
  <el-dialog
    :model-value="modelValue"
    width="920px"
    class="my-shares-dialog"
    destroy-on-close
    :title="t('myShares.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div v-loading="loading" class="my-shares-body">
      <el-empty v-if="!loading && shares.length === 0" :description="t('myShares.empty')" />
      <el-table v-else :data="shares" stripe max-height="420" table-layout="auto">
        <el-table-column prop="summaryLabel" :label="t('myShares.summary')" min-width="160" show-overflow-tooltip />
        <el-table-column prop="shareCode" :label="t('myShares.shareCode')" width="130" show-overflow-tooltip />
        <el-table-column :label="t('myShares.expires')" min-width="118">
          <template #default="{ row }">
            {{ formatExpire(row.expireAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('myShares.status')" width="88">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="viewCount" :label="t('myShares.views')" width="72" align="center" />
        <el-table-column prop="downloadCount" :label="t('myShares.downloads')" width="72" align="center" />
        <el-table-column :label="t('myShares.actions')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="copyShareLink(row)">
              {{ t('myShares.copyLink') }}
            </el-button>
            <el-button type="primary" link size="small" @click="openLogs(row)">
              {{ t('myShares.accessLogs') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="logsVisible"
      width="720px"
      destroy-on-close
      :title="logDialogTitle"
      append-to-body
      @open="onLogsOpen"
    >
      <el-table v-loading="logsLoading" :data="logRows" stripe max-height="400">
        <el-table-column :label="t('myShares.logTime')" width="168">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('myShares.logAction')" width="100">
          <template #default="{ row }">
            {{ actionText(row.action) }}
          </template>
        </el-table-column>
        <el-table-column prop="ipAddress" :label="t('myShares.ip')" width="130" show-overflow-tooltip />
        <el-table-column :label="t('myShares.ua')" min-width="160">
          <template #default="{ row }">
            <span :title="row.userAgent || ''">{{ truncateUa(row.userAgent) }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="logTotal > logPageSize" class="log-pager">
        <el-pagination
          v-model:current-page="logPage"
          :page-size="logPageSize"
          :total="logTotal"
          layout="total, prev, pager, next"
          @current-change="fetchLogs"
        />
      </div>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  listMyShares,
  getShareAccessLogs,
  buildSharePageUrl,
  type MyShareItem,
  type ShareAccessLogRow
} from '@api/share'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t, locale } = useI18n()

const loading = ref(false)
const shares = ref<MyShareItem[]>([])

const logsVisible = ref(false)
const logsLoading = ref(false)
const logRows = ref<ShareAccessLogRow[]>([])
const logTotal = ref(0)
const logPage = ref(1)
const logPageSize = ref(20)
const currentLogShare = ref<MyShareItem | null>(null)

const logDialogTitle = computed(() => {
  const s = currentLogShare.value
  if (!s) return t('myShares.accessLogs')
  return `${t('myShares.accessLogs')} — ${s.summaryLabel}`
})

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'active') return 'success'
  if (status === 'expired') return 'warning'
  return 'info'
}

function statusText(status: string): string {
  if (status === 'active') return t('myShares.statusActive')
  if (status === 'expired') return t('myShares.statusExpired')
  if (status === 'cancelled') return t('myShares.statusCancelled')
  return status
}

function formatExpire(expireAt: string | null): string {
  if (!expireAt) return t('myShares.permanent')
  return formatDateTime(expireAt)
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(locale.value === 'en-US' ? 'en-US' : locale.value === 'zh-TW' ? 'zh-TW' : 'zh-CN')
  } catch {
    return iso
  }
}

function actionText(action: string): string {
  if (action === 'view') return t('myShares.actionView')
  if (action === 'download') return t('myShares.actionDownload')
  return action
}

function truncateUa(ua: string | null, max = 96): string {
  if (!ua) return '—'
  return ua.length <= max ? ua : `${ua.slice(0, max)}…`
}

async function onOpen() {
  loading.value = true
  try {
    shares.value = await listMyShares()
  } catch {
    ElMessage.error(t('myShares.loadFailed'))
    shares.value = []
  } finally {
    loading.value = false
  }
}

function copyShareLink(row: MyShareItem) {
  const url = buildSharePageUrl(row.shareCode, row.extractCode, row.autoFillExtract)
  const code = row.extractCode
  const text = code ? `${url}\n${t('myShares.extractLine', { code })}` : url
  navigator.clipboard
    .writeText(text)
    .then(() => ElMessage.success(t('myShares.copyOk')))
    .catch(() => ElMessage.error(t('myShares.copyFail')))
}

function openLogs(row: MyShareItem) {
  currentLogShare.value = row
  logPage.value = 1
  logsVisible.value = true
}

function onLogsOpen() {
  fetchLogs()
}

async function fetchLogs() {
  const row = currentLogShare.value
  if (!row) return
  logsLoading.value = true
  try {
    const res = await getShareAccessLogs(row.id, logPage.value, logPageSize.value)
    logRows.value = res.list
    logTotal.value = res.total
  } catch {
    ElMessage.error(t('myShares.logLoadFailed'))
    logRows.value = []
    logTotal.value = 0
  } finally {
    logsLoading.value = false
  }
}
</script>

<style scoped lang="scss">
.my-shares-body {
  min-height: 120px;
}

.log-pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
