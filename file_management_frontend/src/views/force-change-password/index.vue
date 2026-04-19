<template>
  <div class="force-pwd-page">
    <div class="force-pwd-card">
      <h1>{{ t('forceChangePassword.title') }}</h1>
      <p class="hint">{{ t('forceChangePassword.hint') }}</p>
      <el-form @submit.prevent="submit">
        <el-form-item :label="t('forceChangePassword.newPassword')">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            size="large"
          />
        </el-form-item>
        <el-form-item :label="t('forceChangePassword.confirmPassword')">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            size="large"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="submit">
            {{ t('forceChangePassword.submit') }}
          </el-button>
        </el-form-item>
        <div class="footer-actions">
          <el-button text type="danger" @click="handleLogout">{{ t('forceChangePassword.logout') }}</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { authApi } from '@api/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const form = reactive({
  newPassword: '',
  confirmPassword: ''
})

const submit = async () => {
  if (!form.newPassword) {
    ElMessage.warning(t('forceChangePassword.fillAll'))
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    ElMessage.warning(t('forceChangePassword.mismatch'))
    return
  }
  loading.value = true
  try {
    const { accessToken, user } = await authApi.changePassword({
      newPassword: form.newPassword
    })
    authStore.updateToken(accessToken)
    authStore.updateUser({
      ...user,
      mustChangePassword: false,
      createdAt: authStore.user?.createdAt ?? user.createdAt
    })
    await authStore.loadUserPreferences()
    ElMessage.success(t('forceChangePassword.success'))
    await router.replace('/')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('forceChangePassword.failed'))
  } finally {
    loading.value = false
  }
}

const handleLogout = async () => {
  try {
    const rt = authStore.refreshToken
    if (rt) {
      await authApi.logout(rt)
    }
  } catch {
    /* 仍本地登出 */
  }
  authStore.logout()
  await router.replace('/login')
}
</script>

<style lang="scss" scoped>
.force-pwd-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.force-pwd-card {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: 420px;

  h1 {
    text-align: center;
    margin-bottom: 12px;
    color: #303133;
    font-size: 1.25rem;
  }

  .hint {
    color: #606266;
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 24px;
    text-align: center;
  }

  .footer-actions {
    text-align: center;
    margin-top: 8px;
  }
}
</style>
