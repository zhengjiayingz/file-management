<template>
  <el-dialog
    v-model="visible"
    :title="t('settingsDialog.title')"
    width="520px"
    destroy-on-close
    class="user-settings-dialog"
    @open="onOpen"
  >
    <div v-loading="loading" class="settings-body">
      <div class="section">
        <div class="section-title">{{ t('settingsDialog.avatar') }}</div>
        <div class="avatar-row">
          <el-avatar :size="64" :src="avatarPreview || undefined">
            {{ authStore.user?.username?.charAt(0)?.toUpperCase() }}
          </el-avatar>
          <el-upload
            class="avatar-uploader"
            :show-file-list="false"
            :http-request="onAvatarRequest"
            accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
          >
            <el-button type="primary" plain>{{ t('settingsDialog.uploadAvatar') }}</el-button>
          </el-upload>
        </div>
        <p class="hint">{{ t('settingsDialog.avatarHint') }}</p>
      </div>

      <div class="section">
        <div class="section-title">{{ t('settingsDialog.email') }}</div>
        <div class="email-row">
          <el-input v-model="emailDraft" :disabled="!emailEditing" :placeholder="t('settingsDialog.emailPlaceholder')" />
          <el-button v-if="!emailEditing" @click="emailEditing = true">{{ t('settingsDialog.modify') }}</el-button>
          <template v-else>
            <el-button type="primary" :loading="savingEmail" @click="saveEmail">{{ t('common.save') }}</el-button>
            <el-button @click="cancelEmailEdit">{{ t('common.cancel') }}</el-button>
          </template>
        </div>
      </div>

      <div class="section">
        <div class="section-title">{{ t('settingsDialog.passwordSection') }}</div>
        <el-button type="primary" plain @click="openChangePasswordDialog">
          {{ t('settingsDialog.changePassword') }}
        </el-button>
      </div>
    </div>

    <el-dialog
      v-model="changePwdDialogVisible"
      :title="t('settingsDialog.changePassword')"
      width="440px"
      append-to-body
      destroy-on-close
      class="change-pwd-nested-dialog"
      @closed="resetPasswordForm"
    >
      <p class="hint nested-hint">{{ passwordHintLine }}</p>
      <el-form label-position="top" class="pwd-form" @submit.prevent="submitChangePassword">
        <el-form-item :label="t('settingsDialog.currentPassword')">
          <el-input
            v-model="pwdCurrent"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item :label="t('settingsDialog.newPassword')">
          <el-input
            v-model="pwdNew"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item :label="t('settingsDialog.confirmNewPassword')">
          <el-input
            v-model="pwdConfirm"
            type="password"
            show-password
            autocomplete="new-password"
            @keyup.enter="submitChangePassword"
          />
        </el-form-item>
        <el-form-item class="pwd-actions">
          <el-button @click="changePwdDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="changingPassword" @click="submitChangePassword">
            {{ t('settingsDialog.submitPassword') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { checkPasswordStrength, buildPasswordPolicyHint, type PasswordPolicyClient } from '@utils/passwordStrength'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { useAuthStore } from '@stores/auth'
import { userApi } from '@api/user'
import { authApi } from '@api/auth'
import { publicAssetUrl } from '@utils/publicAssetUrl'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
}>()

const { t } = useI18n()
const authStore = useAuthStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const savingEmail = ref(false)
const emailDraft = ref('')
const emailBaseline = ref('')
const emailEditing = ref(false)
const avatarPath = ref<string | null>(null)

const changePwdDialogVisible = ref(false)
const pwdCurrent = ref('')
const pwdNew = ref('')
const pwdConfirm = ref('')
const changingPassword = ref(false)
const passwordPolicyForDialog = ref<PasswordPolicyClient | null>(null)

const passwordHintLine = computed(() => {
  if (passwordPolicyForDialog.value) {
    return buildPasswordPolicyHint(passwordPolicyForDialog.value, t)
  }
  return t('settingsDialog.passwordStrengthHint')
})

const avatarPreview = computed(() => {
  const p = avatarPath.value ?? authStore.user?.avatar ?? null
  return publicAssetUrl(p) || undefined
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function resetPasswordForm() {
  pwdCurrent.value = ''
  pwdNew.value = ''
  pwdConfirm.value = ''
}

async function openChangePasswordDialog() {
  resetPasswordForm()
  try {
    passwordPolicyForDialog.value = await authApi.getPasswordPolicy()
  } catch {
    passwordPolicyForDialog.value = null
  }
  changePwdDialogVisible.value = true
}

async function onOpen() {
  loading.value = true
  emailEditing.value = false
  try {
    const p = await userApi.getProfile()
    emailBaseline.value = p.email ?? ''
    emailDraft.value = emailBaseline.value
    avatarPath.value = p.avatarUrl
  } catch {
    emailBaseline.value = authStore.user?.email ?? ''
    emailDraft.value = emailBaseline.value
    avatarPath.value = authStore.user?.avatar ?? null
  } finally {
    loading.value = false
  }
}

function cancelEmailEdit() {
  emailEditing.value = false
  emailDraft.value = emailBaseline.value
}

async function saveEmail() {
  const raw = emailDraft.value.trim()
  if (raw && !EMAIL_RE.test(raw)) {
    ElMessage.error(t('settingsDialog.emailInvalid'))
    return
  }
  savingEmail.value = true
  try {
    const updated = await userApi.updateProfile({ email: raw })
    authStore.updateUser({
      email: updated.email,
      vipExpireAt: updated.vipExpireAt,
      avatar: updated.avatarUrl ?? undefined,
    })
    emailBaseline.value = updated.email ?? ''
    emailDraft.value = emailBaseline.value
    avatarPath.value = updated.avatarUrl
    emailEditing.value = false
    ElMessage.success(t('settingsDialog.saveSuccess'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('settingsDialog.saveFailed'))
  } finally {
    savingEmail.value = false
  }
}

async function submitChangePassword() {
  if (!pwdCurrent.value || !pwdNew.value || !pwdConfirm.value) {
    ElMessage.warning(t('settingsDialog.passwordFillAll'))
    return
  }
  if (pwdNew.value !== pwdConfirm.value) {
    ElMessage.warning(t('settingsDialog.passwordMismatch'))
    return
  }
  let pol = passwordPolicyForDialog.value
  if (!pol) {
    try {
      pol = await authApi.getPasswordPolicy()
      passwordPolicyForDialog.value = pol
    } catch {
      ElMessage.error(t('settingsDialog.passwordFailed'))
      return
    }
  }
  const strength = checkPasswordStrength(pwdNew.value, pol)
  if (strength === 'short') {
    ElMessage.error(t('settingsDialog.passwordStrengthShort', { min: pol.minLength }))
    return
  }
  if (strength === 'weak') {
    ElMessage.error(t('settingsDialog.passwordStrengthWeak'))
    return
  }
  if (pwdNew.value === pwdCurrent.value) {
    ElMessage.warning(t('settingsDialog.passwordSameAsOld'))
    return
  }
  changingPassword.value = true
  try {
    const { accessToken, user } = await authApi.changePassword({
      currentPassword: pwdCurrent.value,
      newPassword: pwdNew.value,
    })
    authStore.updateToken(accessToken)
    authStore.updateUser({
      ...user,
      createdAt: authStore.user?.createdAt ?? user.createdAt,
      avatar: authStore.user?.avatar,
      vipExpireAt: authStore.user?.vipExpireAt ?? user.vipExpireAt,
    })
    changePwdDialogVisible.value = false
    resetPasswordForm()
    ElMessage.success(t('settingsDialog.passwordSuccess'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('settingsDialog.passwordFailed'))
  } finally {
    changingPassword.value = false
  }
}

async function onAvatarRequest(options: UploadRequestOptions) {
  const file = options.file as File
  try {
    const { avatarUrl } = await userApi.uploadAvatar(file)
    avatarPath.value = avatarUrl
    authStore.updateUser({ avatar: avatarUrl })
    ElMessage.success(t('settingsDialog.avatarSuccess'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('settingsDialog.avatarFailed'))
  }
}
</script>

<style scoped lang="scss">
.settings-body {
  min-height: 100px;
}

.section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.email-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;

  .el-input {
    flex: 1;
    min-width: 200px;
  }
}

.pwd-form {
  max-width: 100%;

  :deep(.el-form-item) {
    margin-bottom: 14px;
  }
}

.nested-hint {
  margin: 0 0 12px;
}

.pwd-actions {
  margin-bottom: 0;

  :deep(.el-form-item__content) {
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
