<template>
  <div class="force-pwd-page">
    <div class="force-pwd-card">
      <h1>{{ t('forceChangePassword.title') }}</h1>
      <p class="hint">{{ t('forceChangePassword.hint') }}</p>
      <p v-if="policyHintLine" class="hint policy-line">{{ policyHintLine }}</p>
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
import { computed, reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { authApi } from '@api/auth'
import { checkPasswordStrength, buildPasswordPolicyHint, type PasswordPolicyClient } from '@utils/passwordStrength'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const passwordPolicy = ref<PasswordPolicyClient | null>(null)

const policyHintLine = computed(() =>
  passwordPolicy.value ? buildPasswordPolicyHint(passwordPolicy.value, t) : ''
)

const form = reactive({
  newPassword: '',
  confirmPassword: ''
})

onMounted(async () => {
  try {
    passwordPolicy.value = await authApi.getPasswordPolicy()
  } catch {
    passwordPolicy.value = null
  }
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
  let pol = passwordPolicy.value
  if (!pol) {
    try {
      pol = await authApi.getPasswordPolicy()
      passwordPolicy.value = pol
    } catch {
      ElMessage.error(t('forceChangePassword.failed'))
      return
    }
  }
  const strength = checkPasswordStrength(form.newPassword, pol)
  if (strength === 'short') {
    ElMessage.error(t('settingsDialog.passwordStrengthShort', { min: pol.minLength }))
    return
  }
  if (strength === 'weak') {
    ElMessage.error(t('settingsDialog.passwordStrengthWeak'))
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
    margin-bottom: 12px;
    text-align: center;
  }

  .policy-line {
    margin-bottom: 24px;
    font-weight: 500;
    color: #303133;
  }

  .footer-actions {
    text-align: center;
    margin-top: 8px;
  }
}
</style>
