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

        <!-- 系统管理 -->
        <el-row class="system-settings-row">
          <el-col :span="24">
            <el-card shadow="hover" v-loading="settingsLoading">
              <template #header>
                <div class="card-header">
                  <span>{{ t('admin.systemSettings.title') }}</span>
                  <el-button type="primary" size="small" :loading="settingsSaving" @click="saveSystemSettings">
                    {{ t('common.save') }}
                  </el-button>
                </div>
              </template>
              <el-form v-if="systemSettings" label-width="200px" class="system-settings-form">
                <el-divider content-position="left">{{ t('admin.systemSettings.passwordPolicy') }}</el-divider>
                <el-form-item :label="t('admin.systemSettings.minLength')">
                  <el-input-number v-model="systemSettings.passwordMinLength" :min="4" :max="128" />
                </el-form-item>
                <el-form-item :label="t('admin.systemSettings.requiredCategories')">
                  <div class="password-policy-block">
                    <el-checkbox-group v-model="systemSettings.passwordRequiredCategories" class="password-cat-group">
                      <el-checkbox v-for="key in passwordCategoryOrder" :key="key" :label="key">
                        {{ t(`admin.systemSettings.categoryLabels.${key}`) }}
                      </el-checkbox>
                    </el-checkbox-group>
                    <div class="password-pool-min-row">
                      <span class="pool-min-label">{{ t('admin.systemSettings.minCategoriesInPool') }}</span>
                      <el-input-number v-model="systemSettings.passwordMinCategoriesInPool" :min="1"
                        :max="Math.max(1, systemSettings.passwordRequiredCategories.length)"
                        :disabled="systemSettings.passwordRequiredCategories.length === 0" />
                    </div>
                    <p class="form-hint categories-hint-block">{{ t('admin.systemSettings.categoriesHint') }}</p>
                  </div>
                </el-form-item>
                <el-divider content-position="left">{{ t('admin.systemSettings.storageByRole') }}</el-divider>
                <el-form-item :label="t('admin.systemSettings.storageUser')">
                  <el-input-number v-model="storageGbUser" :min="0.01" :max="999999" :precision="2" :step="0.5" />
                  <span class="form-hint">GB</span>
                </el-form-item>
                <el-form-item :label="t('admin.systemSettings.storageVip')">
                  <el-input-number v-model="storageGbVip" :min="0.01" :max="999999" :precision="2" :step="0.5" />
                  <span class="form-hint">GB</span>
                </el-form-item>
                <el-form-item :label="t('admin.systemSettings.storageAdmin')">
                  <el-input-number v-model="storageGbAdmin" :min="0.01" :max="999999" :precision="2" :step="1" />
                  <span class="form-hint">GB</span>
                </el-form-item>
                <el-divider content-position="left">{{ t('admin.systemSettings.tagLimits') }}</el-divider>
                <el-form-item :label="t('admin.systemSettings.maxTagsUser')">
                  <el-input-number v-model="systemSettings.maxTagsUser" :min="0" :max="100000" />
                </el-form-item>
                <el-form-item :label="t('admin.systemSettings.maxTagsVip')">
                  <el-input-number v-model="systemSettings.maxTagsVip" :min="0" :max="100000" />
                </el-form-item>
              </el-form>
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
                    <el-button size="small" type="primary" plain :loading="syncFriendsLoading"
                      @click="syncFriendsWithAdmin">
                      {{ t('admin.userManagement.syncFriends') }}
                    </el-button>
                    <el-button size="small" @click="loadUsers">{{ t('common.search') }}</el-button>
                  </div>
                </div>
              </template>
              <el-table :data="userList" stripe style="width: 100%">
                <el-table-column prop="id" :label="t('admin.userManagement.id')" width="72" />
                <el-table-column prop="username" :label="t('admin.userManagement.username')" min-width="120" />
                <el-table-column prop="email" :label="t('admin.userManagement.email')" min-width="140"
                  show-overflow-tooltip />
                <el-table-column :label="t('admin.userManagement.role')" width="100">
                  <template #default="{ row }">
                    {{ roleLabel(row.role) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.status')" width="120" align="center">
                  <template #default="{ row }">
                    <el-switch :model-value="row.status === 'active'" :disabled="isStatusSwitchDisabled(row)"
                      @change="(val: string | number | boolean) => onUserStatusChange(row, Boolean(val))" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.loginSession')" width="148" align="center">
                  <template #default="{ row }">
                    <el-switch :model-value="isLoginSessionOn(row)" :disabled="isKickSwitchDisabled(row)" inline-prompt
                      size="small" :active-text="t('admin.userManagement.sessionOnline')"
                      :inactive-text="t('admin.userManagement.sessionKicked')"
                      @change="(val: string | number | boolean) => onLoginSessionSwitch(row, Boolean(val))" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('admin.userManagement.tts')" width="130" align="center">
                  <template #default="{ row }">
                    <el-switch :model-value="row.can_use_tts" :disabled="row.role === 'admin'"
                      @change="(val: string | number | boolean) => onUserTtsChange(row, Boolean(val))" />
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
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { adminApi, type AdminUserRow, type DashboardStats, type SystemSettingsDTO } from '@api/admin'
import { PASSWORD_CATEGORY_ORDER } from '@utils/passwordStrength'
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

const settingsLoading = ref(false)
const settingsSaving = ref(false)
const systemSettings = ref<SystemSettingsDTO | null>(null)
const storageGbUser = ref(1)
const storageGbVip = ref(2)
const storageGbAdmin = ref(100)

const passwordCategoryOrder = PASSWORD_CATEGORY_ORDER

watch(
  () => systemSettings.value?.passwordRequiredCategories,
  (cats) => {
    if (!systemSettings.value || !cats?.length) return
    const max = cats.length
    if (systemSettings.value.passwordMinCategoriesInPool > max) {
      systemSettings.value.passwordMinCategoriesInPool = max
    }
  },
  { deep: true }
)

function bytesToGbString(bytes: string): number {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round((n / 1024 ** 3) * 100) / 100
}

function gbToBytesString(gb: number): string {
  return String(Math.round(gb * 1024 * 1024 * 1024))
}

const loadSystemSettings = async () => {
  settingsLoading.value = true
  try {
    const s = await adminApi.getSystemSettings()
    systemSettings.value = s
    storageGbUser.value = bytesToGbString(s.storageQuotaUserBytes)
    storageGbVip.value = bytesToGbString(s.storageQuotaVipBytes)
    storageGbAdmin.value = bytesToGbString(s.storageQuotaAdminBytes)
  } catch {
    ElMessage.error(t('admin.systemSettings.loadError'))
  } finally {
    settingsLoading.value = false
  }
}

const saveSystemSettings = async () => {
  if (!systemSettings.value) return
  if (!systemSettings.value.passwordRequiredCategories?.length) {
    ElMessage.warning(t('admin.systemSettings.selectOneCategory'))
    return
  }
  const poolN = systemSettings.value.passwordRequiredCategories.length
  const poolM = systemSettings.value.passwordMinCategoriesInPool
  if (poolM < 1 || poolM > poolN) {
    ElMessage.warning(t('admin.systemSettings.minPoolInvalid'))
    return
  }
  settingsSaving.value = true
  try {
    const updated = await adminApi.updateSystemSettings({
      passwordMinLength: systemSettings.value.passwordMinLength,
      passwordRequiredCategories: systemSettings.value.passwordRequiredCategories,
      passwordMinCategoriesInPool: systemSettings.value.passwordMinCategoriesInPool,
      storageQuotaUserBytes: gbToBytesString(storageGbUser.value),
      storageQuotaVipBytes: gbToBytesString(storageGbVip.value),
      storageQuotaAdminBytes: gbToBytesString(storageGbAdmin.value),
      maxTagsUser: systemSettings.value.maxTagsUser,
      maxTagsVip: systemSettings.value.maxTagsVip
    })
    systemSettings.value = updated
    storageGbUser.value = bytesToGbString(updated.storageQuotaUserBytes)
    storageGbVip.value = bytesToGbString(updated.storageQuotaVipBytes)
    storageGbAdmin.value = bytesToGbString(updated.storageQuotaAdminBytes)
    ElMessage.success(t('admin.systemSettings.saveSuccess'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('admin.loadErrorUnknown'))
  } finally {
    settingsSaving.value = false
  }
}

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

async function onUserTtsChange(row: AdminUserRow, enabled: boolean) {
  if (row.role === 'admin') {
    ElMessage.warning(t('admin.userManagement.ttsAdminFixed'))
    return
  }
  try {
    const data = await adminApi.updateUserTts(row.id, enabled)
    row.tts_enabled = data.tts_enabled
    row.can_use_tts = data.can_use_tts
    ElMessage.success(t('admin.userManagement.ttsUpdated'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('admin.loadErrorUnknown'))
    await loadUsers()
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

function isKickSwitchDisabled(row: AdminUserRow) {
  return row.id === authStore.user?.id
}

function isLoginSessionOn(row: AdminUserRow) {
  return !row.last_session_kick_at
}

async function onLoginSessionSwitch(row: AdminUserRow, nextOn: boolean) {
  if (row.id === authStore.user?.id) {
    ElMessage.warning(t('admin.userManagement.cannotKickSelf'))
    return
  }
  try {
    if (!nextOn) {
      await adminApi.kickUserSessions(row.id)
      row.last_session_kick_at = new Date().toISOString()
      row.session_version = (row.session_version ?? 0) + 1
      ElMessage.success(t('admin.userManagement.kickSessionsSuccess'))
    } else {
      await adminApi.clearUserSessionKickMarker(row.id)
      row.last_session_kick_at = null
      ElMessage.success(t('admin.userManagement.sessionKickAckSuccess'))
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('admin.loadErrorUnknown'))
    await loadUsers()
  }
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
    if (next === 'active') {
      row.last_session_kick_at = null
    }
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

  const isDark = document.documentElement.classList.contains('dark')

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

    const pieSliceBorder = isDark ? '#1d1e1f' : '#fff'

    fileTypeChart.setOption({
      tooltip: {
        trigger: 'item',
        // ECharts 的 {b}{c}{d} 不能放在 i18n 字符串里，会被 vue-i18n 当成插值吃掉
        formatter: (params: { name?: string; value?: number | number[] | string; percent?: number }) => {
          const p = params
          const raw = p.value
          const val =
            typeof raw === 'number'
              ? raw
              : Array.isArray(raw)
                ? Number(raw[0])
                : Number(raw)
          const count = Number.isFinite(val) ? Math.round(val) : 0
          const pct =
            p.percent != null && typeof p.percent === 'number' ? p.percent.toFixed(2) : ''
          return t('admin.charts.pieTooltipFmt', {
            name: String(p.name ?? ''),
            count,
            percent: pct
          })
        }
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center',
        textStyle: { color: isDark ? '#cfd3dc' : undefined }
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
            borderColor: pieSliceBorder,
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
        data: rankData.map((i) => i.name),
        axisLabel: { color: isDark ? '#a3a6ad' : undefined }
      },
      yAxis: {
        type: 'value',
        name: t('admin.charts.storageAxisMB'),
        axisLabel: { color: isDark ? '#a3a6ad' : undefined },
        nameTextStyle: { color: isDark ? '#a3a6ad' : undefined },
        splitLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.08)' : undefined } }
      },
      series: [
        {
          data: rankData.map((i) => i.value),
          type: 'bar',
          showBackground: true,
          backgroundStyle: {
            color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(180, 180, 180, 0.2)'
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
  loadSystemSettings()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  fileTypeChart?.dispose()
  storageRankChart?.dispose()
})
</script>

<style scoped>
/* 使用 Element Plus 变量，避免深色模式下页背仍为浅灰从而在区块间露出「白缝」 */
.admin-dashboard {
  min-height: 100vh;
  background-color: var(--el-bg-color-page);
  color: var(--el-text-color-primary);
}

.admin-dashboard :deep(.el-container) {
  background-color: transparent;
}

.admin-dashboard :deep(.el-main) {
  background-color: transparent;
}

.dashboard-header {
  background-color: var(--el-bg-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-shadow: var(--el-box-shadow-lighter);
  margin-bottom: 20px;
}

.dashboard-header h2 {
  color: var(--el-text-color-primary);
  font-weight: 600;
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
  color: var(--el-text-color-primary);
  margin: 10px 0;
}

.card-desc {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.status-normal {
  color: var(--el-color-success);
}

.charts-row {
  margin-bottom: 20px;
}

.chart-container {
  height: 350px;
  width: 100%;
}

.system-settings-row {
  margin-bottom: 20px;
}

.system-settings-form .form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.system-settings-form .password-policy-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 720px;
}

.system-settings-form .password-cat-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
}

.system-settings-form .password-pool-min-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.system-settings-form .pool-min-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.system-settings-form .categories-hint-block {
  margin: 0;
  line-height: 1.5;
}

.user-mgmt-row {
  margin-bottom: 20px;
}

.logs-row {
  margin-bottom: 20px;
}
</style>
