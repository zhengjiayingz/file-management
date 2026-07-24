<template>
  <el-dialog
    v-model="visible"
    :title="t('sessionManage.title')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="false"
    @open="load"
    @closed="onClosed"
  >
    <div v-if="loading" class="loading-wrap">
      <el-skeleton :rows="4" animated />
    </div>
    <div v-else-if="sessions.length === 0" class="empty muted">
      {{ t('sessionManage.empty') }}
    </div>
    <el-checkbox-group v-else v-model="selectedIds" class="session-list">
      <div v-for="s in sessions" :key="s.id" class="session-row">
        <el-checkbox :label="s.id">
          <span class="session-meta">
            <strong>{{ s.ipAddress }}</strong>
            <el-tag v-if="s.id === currentSessionId" size="small" type="success" class="tag-current">
              {{ t('sessionManage.currentDevice') }}
            </el-tag>
            <span class="ua" :title="s.userAgent || ''">{{ shortUa(s.userAgent) }}</span>
          </span>
          <span class="session-time">{{ formatTime(s.lastUsedAt || s.createdAt) }}</span>
        </el-checkbox>
      </div>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="revoking"
        :disabled="selectedIds.length === 0"
        @click="doRevoke"
      >
        {{ t('sessionManage.logoutSelected') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { authApi } from '@api/auth'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const loading = ref(false)
const revoking = ref(false)
const sessions = ref<
  Array<{
    id: number
    ipAddress: string
    userAgent: string | null
    deviceName: string | null
    deviceType: string | null
    createdAt: string
    lastUsedAt: string | null
  }>
>([])
const currentSessionId = ref<number | null>(null)
const selectedIds = ref<number[]>([])

function shortUa(ua: string | null | undefined): string {
  if (!ua) return '—'
  return ua.length > 48 ? ua.slice(0, 45) + '…' : ua
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function onClosed() {
  sessions.value = []
  currentSessionId.value = null
  selectedIds.value = []
}

async function load() {
  loading.value = true
  try {
    const rt = authStore.refreshToken
    const data = await authApi.listSessions(rt || undefined)
    sessions.value = data.sessions
    currentSessionId.value = data.currentSessionId
    selectedIds.value = []
  } catch {
    ElMessage.error(t('sessionManage.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function doRevoke() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning(t('sessionManage.selectAtLeastOne'))
    return
  }
  const rt = authStore.refreshToken
  if (!rt) {
    ElMessage.error(t('sessionManage.noRefresh'))
    return
  }
  revoking.value = true
  try {
    await authApi.revokeSessions(
      selectedIds.value.map((id) => Number(id)),
      rt
    )
    ElMessage.success(t('sessionManage.logoutSuccess'))
    visible.value = false
    // session_version 已递增，当前 Access 失效：用 refresh 换新
    const { data } = await axios.post(`${API_BASE_URL}/api/auth/refresh`, { refreshToken: rt })
    if (data?.success && data?.data?.accessToken) {
      authStore.updateToken(data.data.accessToken)
    }
    await authStore.refreshUserInfo()
  } catch (err: unknown) {
    const ax = err as { response?: { status?: number; data?: { code?: string; message?: string } } }
    const status = ax.response?.status
    const code = ax.response?.data?.code
    if (status === 401 && code === 'SESSION_REVOKED_SELF') {
      ElMessage.info(t('sessionManage.selfRevoked'))
      authStore.logout()
      visible.value = false
      await router.push('/login')
      window.location.reload()
      return
    }
    const msg = ax.response?.data?.message
    ElMessage.error(msg || t('sessionManage.revokeFailed'))
  } finally {
    revoking.value = false
  }
}
</script>

<style lang="scss" scoped>
.loading-wrap {
  padding: 8px 0;
}
.empty {
  text-align: center;
  padding: 24px;
}
.session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.session-row {
  :deep(.el-checkbox) {
    align-items: flex-start;
    width: 100%;
    margin-right: 0;
  }
  :deep(.el-checkbox__label) {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
  }
}
.session-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tag-current {
  flex-shrink: 0;
}
.ua {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  max-width: 100%;
}
.session-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.muted {
  color: var(--el-text-color-secondary);
}
</style>
