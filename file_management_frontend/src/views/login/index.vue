<template>
  <div class="login-container">
    <div class="login-form">
      <h1>{{ isRegister ? t('login.register') : t('login.title') }}</h1>
      <el-form @submit.prevent="handleAuth">
        <el-form-item>
          <el-input v-model="loginForm.username" :placeholder="t('login.username')" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="loginForm.password" type="password" :placeholder="t('login.password')" size="large"
            :prefix-icon="Lock" @keyup.enter="handleAuth" />
        </el-form-item>

        <el-form-item v-if="isRegister">
          <el-input v-model="loginForm.email" placeholder="Email (Optional)" size="large" :prefix-icon="Message" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleAuth">
            {{ isRegister ? t('login.register') : t('login.login') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="!isRegister" class="login-extras">
        <el-link type="primary" @click="handleForgotPassword">{{ t('login.forgotPassword') }}</el-link>
      </div>

      <div class="form-footer">
        <el-link type="primary" @click="toggleMode">
          {{ isRegister ? t('login.hasAccount') : t('login.noAccount') }}
        </el-link>
      </div>
    </div>

    <el-dialog
      v-model="sessionLimitOpen"
      :title="t('login.sessionLimitTitle')"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
      @closed="onSessionDialogClosed"
    >
      <p class="session-hint">
        {{ t('login.sessionLimitHint', { n: sessionLimitPayload?.maxSessions ?? 2 }) }}
      </p>
      <p v-if="sessionLimitPayload" class="session-max muted">
        {{ t('login.sessionLimitMax', { n: sessionLimitPayload.maxSessions }) }}
      </p>
      <el-radio-group v-model="selectedSessionId" class="session-list">
        <div v-for="s in sessionLimitPayload?.sessions ?? []" :key="s.id" class="session-row">
          <el-radio :label="s.id">
            <span class="session-meta">
              <strong>{{ s.ipAddress }}</strong>
              <span class="ua" :title="s.userAgent || ''">{{ shortUa(s.userAgent) }}</span>
            </span>
            <span class="session-time">{{ formatSessionTime(s.lastUsedAt || s.createdAt) }}</span>
          </el-radio>
        </div>
      </el-radio-group>
      <template #footer>
        <div class="dialog-footer-col">
          <el-link
            v-if="sessionLimitPayload?.showVipLink"
            type="primary"
            class="vip-link"
            @click="goVipApply"
          >
            {{ t('login.upgradeVip') }}
          </el-link>
          <div class="dialog-actions">
            <el-button @click="sessionLimitOpen = false">{{ t('login.sessionLimitCancel') }}</el-button>
            <el-button
              type="primary"
              :loading="loading"
              :disabled="!selectedSessionId"
              @click="confirmKickAndLogin"
            >
              {{ t('login.sessionLimitKickAndLogin') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { User, Lock, Message } from '@element-plus/icons-vue'
import { useAuthStore } from '@stores/auth'
import { authApi } from '@api/auth'
import { useI18n } from 'vue-i18n'

export interface SessionListItem {
  id: number
  ipAddress: string
  userAgent: string | null
  deviceName: string | null
  deviceType: string | null
  createdAt: string
  lastUsedAt: string | null
}

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()

const isRegister = ref(false)
const loginForm = ref({
  username: '',
  password: '',
  email: ''
})

const loading = ref(false)

const sessionLimitOpen = ref(false)
const sessionLimitPayload = ref<{
  maxSessions: number
  sessions: SessionListItem[]
  showVipLink: boolean
} | null>(null)
const selectedSessionId = ref<number | undefined>(undefined)

function shortUa(ua: string | null | undefined): string {
  if (!ua) return '—'
  return ua.length > 48 ? ua.slice(0, 45) + '…' : ua
}

function formatSessionTime(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function onSessionDialogClosed() {
  sessionLimitPayload.value = null
  selectedSessionId.value = undefined
}

function goVipApply() {
  sessionLimitOpen.value = false
  router.push({ path: '/', query: { openVip: '1' } })
}

async function afterLoginSuccess(
  res: Awaited<ReturnType<typeof authApi.login>>,
  options?: { successMessage?: string }
) {
  ElMessage.success(options?.successMessage ?? t('login.login') + ' Success')
  await authStore.login({
    user: res.user,
    token: res.token,
    refreshToken: res.refreshToken
  })
  if (res.user.mustChangePassword) {
    await router.push('/force-change-password')
  } else {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect.trim() : ''
    if (redirect.startsWith('/')) {
      await router.push(redirect)
    } else {
      await router.push('/')
    }
  }
}

async function confirmKickAndLogin() {
  if (!selectedSessionId.value || !sessionLimitPayload.value) return
  loading.value = true
  try {
    const res = await authApi.login({
      username: loginForm.value.username,
      password: loginForm.value.password,
      revokeSessionId: Number(selectedSessionId.value)
    })
    sessionLimitOpen.value = false
    sessionLimitPayload.value = null
    await afterLoginSuccess(res, { successMessage: t('login.sessionLimitKickSuccess') })
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data
      const msg = (data as { message?: string })?.message || error.message
      ElMessage.error(msg || t('login.wrongCredentials'))
    } else {
      ElMessage.error(t('login.wrongCredentials'))
    }
  } finally {
    loading.value = false
  }
}

const handleAuth = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning(t('login.username') + ' / ' + t('login.password'))
    return
  }

  if (isRegister.value && !loginForm.value.email) {
    // Optional
  }

  /**
   * 会话上限弹窗打开时，密码框回车 / 主「登录」仍会走本函数。
   * 若继续发未带 revokeSessionId 的登录，会多一次 409（与「踢出并登录」并发，易误判为踢人失败）。
   */
  if (!isRegister.value && sessionLimitOpen.value) {
    if (selectedSessionId.value) {
      await confirmKickAndLogin()
    }
    return
  }

  try {
    loading.value = true

    if (isRegister.value) {
      await authApi.register({
        username: loginForm.value.username,
        password: loginForm.value.password,
        email: loginForm.value.email || undefined
      })

      ElMessage.success(t('login.register') + ' Success')
      toggleMode()
    } else {
      const res = await authApi.login({
        username: loginForm.value.username,
        password: loginForm.value.password
      })
      await afterLoginSuccess(res)
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const body = error.response.data as {
        code?: string
        data?: { maxSessions: number; sessions: SessionListItem[]; showVipLink: boolean }
      }
      if (body?.code === 'SESSION_LIMIT' && body.data?.sessions) {
        sessionLimitPayload.value = body.data
        selectedSessionId.value = body.data.sessions[0]?.id
        sessionLimitOpen.value = true
        return
      }
    }
    if (isRegister.value) {
      const msg =
        axios.isAxiosError(error) && error.response?.data
          ? (error.response.data as { message?: string }).message
          : error instanceof Error
            ? error.message
            : 'Error'
      ElMessage.error(t('login.register') + ' Failed: ' + (msg || ''))
    } else {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status === 401) {
        ElMessage.error(t('login.wrongCredentials'))
      } else {
        const msg =
          axios.isAxiosError(error) && error.response?.data
            ? (error.response.data as { message?: string }).message
            : error instanceof Error
              ? error.message
              : t('login.wrongCredentials')
        ElMessage.error(msg || t('login.wrongCredentials'))
      }
    }
  } finally {
    loading.value = false
  }
}

const toggleMode = () => {
  isRegister.value = !isRegister.value
  loginForm.value = { username: '', password: '', email: '' }
}

const handleForgotPassword = async () => {
  const name = loginForm.value.username?.trim()
  if (!name) {
    ElMessage.warning(t('login.forgotPasswordNeedUsername'))
    return
  }
  try {
    const r = await authApi.forgotPassword({ username: name })
    ElMessage.info(r.message || '请等待管理员重置密码')
  } catch (error: unknown) {
    const msg =
      axios.isAxiosError(error) && error.response?.data
        ? (error.response.data as { message?: string }).message
        : error instanceof Error
          ? error.message
          : 'Error'
    ElMessage.error(msg || 'Error')
  }
}
</script>

<style lang="scss" scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-form {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: 400px;

  h1 {
    text-align: center;
    margin-bottom: 30px;
    color: #303133;
  }

  .login-extras {
    margin-top: 8px;
    text-align: center;
  }

  .form-footer {
    margin-top: 20px;
    text-align: center;
  }
}

.session-hint {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.session-max.muted {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  align-items: stretch;
}

.session-row {
  :deep(.el-radio) {
    width: 100%;
    height: auto;
    margin-right: 0;
    align-items: flex-start;
    white-space: normal;
  }
  :deep(.el-radio__label) {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }
}

.session-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  .ua {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.session-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dialog-footer-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.vip-link {
  align-self: flex-start;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
