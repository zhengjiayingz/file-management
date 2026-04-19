<template>
  <el-dialog
    v-model="visible"
    :title="t('vipCenter.title')"
    width="min(960px, 96vw)"
    class="vip-center-dialog"
    destroy-on-close
    @open="onOpen"
  >
    <div class="vip-layout">
      <div class="vip-main">
        <div class="vip-user-bar">
          <el-avatar :size="48" class="vip-avatar">{{ userInitial }}</el-avatar>
          <div class="vip-user-meta">
            <div class="vip-greeting">{{ t('vipCenter.greeting', { name: authStore.user?.username ?? '' }) }}</div>
            <div class="vip-badges">
              <span class="tier-pill" :class="tierClass">{{ tierLabel }}</span>
              <span v-if="authStore.user?.role === 'vip'" class="expire-hint">{{ t('vipCenter.vipBenefitsHint') }}</span>
            </div>
          </div>
        </div>

        <el-tabs v-model="activeTier" class="vip-tabs">
          <el-tab-pane name="svip">
            <template #label>
              <div class="tab-label">
                <span>{{ t('vipCenter.colSvip') }}</span>
                <small>{{ t('vipCenter.tabSvipSubtitle') }}</small>
              </div>
            </template>
          </el-tab-pane>
          <el-tab-pane name="vip">
            <template #label>
              <div class="tab-label">
                <span>{{ t('vipCenter.colVip') }}</span>
                <small>{{ t('vipCenter.tabVipSubtitle') }}</small>
              </div>
            </template>
          </el-tab-pane>
        </el-tabs>

        <p class="vip-hint">{{ t('vipCenter.disclaimer') }}</p>

        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th class="col-feature">{{ t('vipCenter.colPrivilege') }}</th>
                <th class="col-svip">{{ t('vipCenter.colSvip') }}</th>
                <th class="col-vip">{{ t('vipCenter.colVip') }}</th>
                <th class="col-user">{{ t('vipCenter.colNormalUser') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ t('vipCenter.rowStorage') }}</td>
                <td class="highlight">{{ t('vipCenter.rowStorageSvip') }}</td>
                <td>{{ t('vipCenter.rowStorageVip') }}</td>
                <td>{{ t('vipCenter.rowStorageUser') }}</td>
              </tr>
              <tr>
                <td>{{ t('vipCenter.rowDownload') }}</td>
                <td class="highlight">{{ t('vipCenter.rowDownloadSvip') }}</td>
                <td>{{ t('vipCenter.rowDownloadVip') }}</td>
                <td>{{ t('vipCenter.rowDownloadUser') }}</td>
              </tr>
              <tr>
                <td>{{ t('vipCenter.rowZip') }}</td>
                <td class="highlight">{{ t('vipCenter.support') }}</td>
                <td>{{ t('vipCenter.support') }}</td>
                <td>{{ t('vipCenter.rowZipUser') }}</td>
              </tr>
              <tr>
                <td>{{ t('vipCenter.rowBatch') }}</td>
                <td class="highlight">{{ t('vipCenter.support') }}</td>
                <td>{{ t('vipCenter.support') }}</td>
                <td>{{ t('vipCenter.support') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside class="vip-side">
        <div class="side-inner">
          <p class="side-title">{{ t('vipCenter.sideTitle') }}</p>
          <p class="side-desc">{{ t('vipCenter.sideDesc') }}</p>
          <el-button
            type="warning"
            size="large"
            class="apply-btn"
            :loading="applying"
            :disabled="applyDisabled"
            @click="handleApply"
          >
            {{ applyButtonText }}
          </el-button>
        </div>
      </aside>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { vipApi } from '@api/vip'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const authStore = useAuthStore()
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const activeTier = ref('svip')
const applying = ref(false)
const hasPending = ref(false)

const userInitial = computed(() =>
  (authStore.user?.username || '?').charAt(0).toUpperCase()
)

const tierLabel = computed(() => {
  const r = authStore.user?.role
  if (r === 'admin') return t('vipCenter.tierAdmin')
  if (r === 'vip') return t('vipCenter.tierVip')
  return t('vipCenter.tierUser')
})

const tierClass = computed(() => {
  const r = authStore.user?.role
  if (r === 'admin') return 'is-admin'
  if (r === 'vip') return 'is-vip'
  return 'is-user'
})

const applyDisabled = computed(() => {
  const r = authStore.user?.role
  if (!r || r === 'admin') return true
  if (r === 'vip') return true
  return hasPending.value
})

const applyButtonText = computed(() => {
  const r = authStore.user?.role
  if (r === 'vip') return t('vipCenter.btnAlreadyVip')
  if (r === 'admin') return t('vipCenter.btnAdminNoApply')
  if (hasPending.value) return t('vipCenter.btnPending')
  return t('vipCenter.btnApply')
})

async function refreshStatus() {
  try {
    const s = await vipApi.getMyStatus()
    hasPending.value = s.hasPending
  } catch {
    hasPending.value = false
  }
}

function onOpen() {
  refreshStatus()
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) refreshStatus()
  }
)

async function handleApply() {
  if (applyDisabled.value) return
  applying.value = true
  try {
    const r = await vipApi.apply()
    ElMessage.success(r.message)
    await refreshStatus()
  } catch (e: unknown) {
    const ax = e as { response?: { data?: { message?: string } } }
    ElMessage.error(ax.response?.data?.message || t('vipCenter.submitFailed'))
  } finally {
    applying.value = false
  }
}
</script>

<style scoped lang="scss">
.vip-layout {
  display: flex;
  gap: 20px;
  min-height: 360px;
  align-items: stretch;
}

.vip-main {
  flex: 1;
  min-width: 0;
}

.vip-side {
  width: 220px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #fff9f0 0%, #fff3e0 100%);
  border-radius: 12px;
  border: 1px solid #ffe0b2;
  padding: 20px 16px;
}

.side-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.side-title {
  font-size: 16px;
  font-weight: 600;
  color: #d35400;
  margin: 0;
}

.side-desc {
  font-size: 12px;
  color: #8d6e63;
  line-height: 1.5;
  margin: 0;
}

.apply-btn {
  width: 100%;
  font-weight: 600;
}

.vip-user-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.vip-avatar {
  background: linear-gradient(135deg, #ffb74d, #ff9800);
  color: #fff;
  font-weight: 700;
}

.vip-greeting {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.vip-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.tier-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 20px;
  background: #f0f0f0;
  color: #606266;
  &.is-vip {
    background: #fff7e6;
    color: #d48806;
    border: 1px solid #ffd591;
  }
  &.is-admin {
    background: #e6f7ff;
    color: #096dd9;
    border: 1px solid #91d5ff;
  }
}

.expire-hint {
  font-size: 12px;
  color: #909399;
}

.vip-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.tab-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
  small {
    font-size: 11px;
    color: #909399;
    font-weight: normal;
  }
}

.vip-hint {
  font-size: 12px;
  color: #909399;
  margin: 0 0 12px;
}

.compare-table-wrap {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid #f5f5f5;
    text-align: center;
  }
  th {
    background: #fafafa;
    font-weight: 600;
  }
  .col-feature {
    text-align: left;
    min-width: 120px;
  }
  .col-svip {
    background: #fffbf0;
    min-width: 100px;
  }
  .highlight {
    font-weight: 600;
    color: #d48806;
  }
}

html.dark .vip-side {
  background: linear-gradient(180deg, #2a2418 0%, #1f1c14 100%);
  border-color: #5c4d2e;
}
html.dark .compare-table th {
  background: #2a2a2a;
}
html.dark .compare-table {
  border-color: #3a3a3a;
}
html.dark .compare-table td,
html.dark .compare-table th {
  border-color: #3a3a3a;
}
html.dark .col-svip {
  background: #3a3020;
}
</style>
