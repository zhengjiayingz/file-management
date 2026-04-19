<template>
  <div class="admin-dashboard">
    <el-container>
      <el-header height="60px" class="dashboard-header">
        <div class="header-left">
          <h2>{{ t('admin.title') }}</h2>
        </div>
        <div class="header-right">
          <el-button @click="router.push('/')">{{ t('admin.backHome') }}</el-button>
        </div>
      </el-header>

      <el-main v-loading="loading">
        <!-- 概览卡片 -->
        <el-row :gutter="20" class="overview-cards">
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.cards.totalUsers') }}</span>
                </div>
              </template>
              <div class="card-value">{{ stats?.users.total || 0 }}</div>
              <div class="card-desc">{{ t('admin.cards.activeUsers') }}: {{ stats?.users.active || 0 }}</div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.cards.totalStorage') }}</span>
                </div>
              </template>
              <div class="card-value">{{ formatSize(stats?.storage.totalUsed) }}</div>
              <div class="card-desc">{{ t('admin.cards.totalFiles') }}: {{ stats?.files.total || 0 }}</div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.cards.adminCount') }}</span>
                </div>
              </template>
              <div class="card-value">{{ stats?.users.roles['admin'] || 0 }}</div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.cards.systemStatus') }}</span>
                </div>
              </template>
              <div class="card-value status-normal">{{ t('admin.cards.running') }}</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 图表区域 -->
        <el-row :gutter="20" class="charts-row">
          <el-col :span="12">
            <el-card shadow="hover" class="chart-card">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.charts.fileTypeDistribution') }}</span>
                </div>
              </template>
              <div ref="fileTypeChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="hover" class="chart-card">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.charts.storageRanking') }}</span>
                </div>
              </template>
              <div ref="storageRankChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 用户管理 -->
        <el-row class="user-mgmt-row">
          <el-col :span="24">
            <el-card shadow="hover" v-loading="usersLoading">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.userManagement.title') }}</span>
                  <div class="user-mgmt-actions">
                    <el-button size="small" type="primary" plain :loading="syncFriendsLoading" @click="syncFriendsWithAdmin">
                      {{ t('admin.userManagement.syncFriends') }}
                    </el-button>
                    <el-button size="small" @click="loadUsers">{{ t('common.search') }}</el-button>
                  </div>
                </div>
              </template>
              <el-table :data="userList" stripe style="width: 100%">
                <el-table-column prop="id" :label="t('admin.userManagement.id')" width="72" />
                <el-table-column prop="username" :label="t('admin.userManagement.username')" min-width="120" />
                <el-table-column prop="email" :label="t('admin.userManagement.email')" min-width="140" show-overflow-tooltip />
                <el-table-column :label="t('admin.userManagement.role')" width="100">
                  <template #default="{ row }">
                    {{ roleLabel(row.role) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.status')" width="120" align="center">
                  <template #default="{ row }">
                    <el-switch
                      :model-value="row.status === 'active'"
                      :disabled="isStatusSwitchDisabled(row)"
                      @change="(val: string | number | boolean) => onUserStatusChange(row, Boolean(val))"
                    />
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.storage')" min-width="140">
                  <template #default="{ row }">
                    {{ formatSize(row.storage_used) }} / {{ formatSize(row.storage_quota) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.createdAt')" width="180">
                  <template #default="{ row }">
                    {{ new Date(row.created_at).toLocaleString() }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.actions')" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link @click="openResetPassword(row)">
                      {{ t('admin.userManagement.resetPassword') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>

        <!-- 操作日志表格 -->
        <el-row class="logs-row">
          <el-col :span="24">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.recentLogs') }}</span>
                </div>
              </template>
              <el-table :data="stats?.logs.recent || []" style="width: 100%" stripe>
                <el-table-column prop="createdAt" :label="t('admin.table.time')" width="180">
                  <template #default="scope">
                    {{ new Date(scope.row.createdAt).toLocaleString() }}
                  </template>
                </el-table-column>
                <el-table-column prop="user.username" :label="t('admin.table.user')" width="120" />
                <el-table-column prop="operationType" :label="t('admin.table.operationType')" width="120">
                  <template #default="scope">
                    <el-tag>{{ scope.row.operationType }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="resourceType" :label="t('admin.table.resourceType')" width="120" />
                <el-table-column prop="description" :label="t('admin.table.description')" />
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { adminApi, type AdminUserRow, type DashboardStats } from '@api/admin'
import { formatFileSize } from '@utils/fileUpload'
import { useAuthStore } from '@stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const { t, te } = useI18n()
const loading = ref(false)
const stats = ref<DashboardStats | null>(null)

const usersLoading = ref(false)
const syncFriendsLoading = ref(false)
const userList = ref<AdminUserRow[]>([])

const fileTypeChartRef = ref<HTMLElement | null>(null)
const storageRankChartRef = ref<HTMLElement | null>(null)

let fileTypeChart: echarts.ECharts | null = null
let storageRankChart: echarts.ECharts | null = null

/** 与 locales 中 admin.mime.* 键一致 */
function mimeToI18nKey(mime: string): string {
  const base = mime.split(';')[0]?.trim() || mime
  return base
    .replace(/\+/g, '_')
    .replace(/\//g, '_')
    .replace(/\./g, '_')
    .replace(/-/g, '_')
    .toLowerCase()
}

function getFriendlyTypeName(mimeType: string): string {
  const key = `admin.mime.${mimeToI18nKey(mimeType)}`
  if (te(key)) {
    return t(key)
  }

  const baseType = mimeType.split(';')[0]?.trim() || mimeType
  const key2 = `admin.mime.${mimeToI18nKey(baseType)}`
  if (te(key2)) {
    return t(key2)
  }

  const [mainType, subType] = baseType.split('/')
  if (mainType === 'image') return t('admin.category.image')
  if (mainType === 'video') return t('admin.category.video')
  if (mainType === 'audio') return t('admin.category.audio')
  if (mainType === 'text') return t('admin.category.text')

  if (subType) {
    const st = subType.toLowerCase()
    if (st.includes('word')) return t('admin.docHint.word')
    if (st.includes('excel') || st.includes('spreadsheet')) return t('admin.docHint.excel')
    if (st.includes('powerpoint') || st.includes('presentation')) return t('admin.docHint.ppt')
    if (st.includes('zip') || st.includes('compressed')) return t('admin.docHint.archive')
    return subType.split('.').pop() || subType
  }

  return mimeType
}

const loadData = async () => {
  loading.value = true
  try {
    stats.value = await adminApi.getDashboardStats()
    await nextTick()
    initCharts()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : ''
    ElMessage.error(`${t('admin.loadError')}: ${msg || t('admin.loadErrorUnknown')}`)
  } finally {
    loading.value = false
  }
}

const loadUsers = async () => {
  usersLoading.value = true
  try {
    userList.value = await adminApi.listUsers()
  } catch {
    ElMessage.error(t('admin.userManagement.loadError'))
  } finally {
    usersLoading.value = false
  }
}

async function syncFriendsWithAdmin() {
  syncFriendsLoading.value = true
  try {
    const r = await adminApi.syncFriendshipsWithAdmin()
    ElMessage.success(r.message)
    if (r.data.failures?.length) {
      console.warn('sync friendships failures', r.data.failures)
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('admin.userManagement.syncFriendsError'))
  } finally {
    syncFriendsLoading.value = false
  }
}

function roleLabel(role: string) {
  const key = `admin.userManagement.roles.${role}` as const
  return te(key) ? t(key) : role
}

function isStatusSwitchDisabled(row: AdminUserRow) {
  if (row.id === authStore.user?.id) return true
  if (row.role === 'admin') return true
  return false
}

async function onUserStatusChange(row: AdminUserRow, active: boolean) {
  const next = active ? 'active' : 'disabled'
  if (row.id === authStore.user?.id && next === 'disabled') {
    ElMessage.warning(t('admin.userManagement.cannotDisableSelf'))
    return
  }
  if (row.role === 'admin' && next === 'disabled') {
    ElMessage.warning(t('admin.userManagement.cannotDisableAdmin'))
    return
  }
  try {
    await adminApi.updateUserStatus(row.id, next)
    row.status = next
    ElMessage.success(t('admin.userManagement.statusUpdated'))
  } catch {
    await loadUsers()
  }
}

async function openResetPassword(row: AdminUserRow) {
  try {
    await ElMessageBox.confirm(
      t('admin.userManagement.resetConfirmMessage', { name: row.username }),
      t('admin.userManagement.resetConfirmTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    await adminApi.resetUserPassword(row.id)
    ElMessage.success(t('admin.userManagement.resetSuccessDetail'))
  } catch (e: unknown) {
    if (e === 'cancel' || e === 'close') return
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('admin.loadErrorUnknown'))
  }
}

const initCharts = () => {
  if (!stats.value) return

  if (fileTypeChartRef.value) {
    fileTypeChart?.dispose()
    fileTypeChart = echarts.init(fileTypeChartRef.value)

    const typeMap = new Map<string, number>()
    stats.value.files.types.forEach((item) => {
      const friendlyName = getFriendlyTypeName(item.mimeType)
      typeMap.set(friendlyName, (typeMap.get(friendlyName) || 0) + item._count.id)
    })

    const typeData = Array.from(typeMap.entries()).map(([name, value]) => ({
      name,
      value
    }))

    fileTypeChart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: t('admin.charts.pieTooltip')
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      series: [
        {
          name: t('admin.charts.pieSeriesName'),
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: true,
            formatter: '{b}\n{d}%'
          },
          labelLine: {
            show: true
          },
          data: typeData,
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    })
  }

  if (storageRankChartRef.value) {
    storageRankChart?.dispose()
    storageRankChart = echarts.init(storageRankChartRef.value)

    const rankData = stats.value.storage.ranking.map((item) => ({
      name: item.username,
      value: (Number(item.storageUsed) / (1024 * 1024)).toFixed(2)
    }))

    storageRankChart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      xAxis: {
        type: 'category',
        data: rankData.map((i) => i.name)
      },
      yAxis: {
        type: 'value',
        name: t('admin.charts.storageAxisMB')
      },
      series: [
        {
          data: rankData.map((i) => i.value),
          type: 'bar',
          showBackground: true,
          backgroundStyle: {
            color: 'rgba(180, 180, 180, 0.2)'
          },
          label: {
            show: true,
            position: 'top'
          }
        }
      ]
    })
  }
}

const formatSize = (sizeStr?: string | number) => {
  if (!sizeStr) return '0 B'
  const size = Number(sizeStr)
  return formatFileSize(size)
}

const handleResize = () => {
  fileTypeChart?.resize()
  storageRankChart?.resize()
}

onMounted(() => {
  loadData()
  loadUsers()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  fileTypeChart?.dispose()
  storageRankChart?.dispose()
})
</script>

<style scoped>
.admin-dashboard {
  background-color: #f5f7fa;
  min-height: 100vh;
}

.dashboard-header {
  background-color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
}

.overview-cards {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-mgmt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin: 10px 0;
}

.card-desc {
  font-size: 14px;
  color: #909399;
}

.status-normal {
  color: #67c23a;
}

.charts-row {
  margin-bottom: 20px;
}

.chart-container {
  height: 350px;
  width: 100%;
}

.user-mgmt-row {
  margin-bottom: 20px;
}

.logs-row {
  margin-bottom: 20px;
}
</style>
