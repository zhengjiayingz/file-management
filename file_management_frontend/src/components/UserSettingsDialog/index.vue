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

        <div class="mfa-block">
          <div class="section-sub">{{ t('settingsDialog.mfaSection') }}</div>
          <p v-if="totpEnabled" class="hint">{{ t('settingsDialog.mfaBoundHint') }}</p>
          <p v-else-if="mfaSetupPending" class="hint warn">{{ t('settingsDialog.mfaSetupPendingHint') }}</p>

          <div v-if="!totpEnabled" class="mfa-actions">
            <el-button type="primary" plain :loading="mfaStarting" @click="startMfaSetup">
              {{ mfaSetupPending ? t('settingsDialog.mfaConfirmBind') : t('settingsDialog.mfaEnable') }}
            </el-button>
            <el-button v-if="mfaSetupPending" @click="cancelMfaSetup">{{ t('settingsDialog.mfaCancelSetup') }}</el-button>
          </div>
          <el-button v-else type="warning" plain @click="mfaDisableDialogOpen = true">
            {{ t('settingsDialog.mfaDisable') }}
          </el-button>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="mfaBindDialogVisible"
      :title="t('settingsDialog.mfaEnable')"
      width="420px"
      append-to-body
      destroy-on-close
      @closed="onMfaBindDialogClose"
    >
      <p class="hint">{{ t('settingsDialog.mfaScanHint') }}</p>
      <div v-if="mfaQrDataUrl" class="mfa-qr-wrap">
        <img :src="mfaQrDataUrl" alt="TOTP QR" class="mfa-qr" />
      </div>
      <el-input
        v-model="mfaBindCode"
        maxlength="6"
        :placeholder="t('login.mfaPlaceholder')"
        class="mfa-code-input"
        @keyup.enter="confirmMfaBind"
      />
      <template #footer>
        <el-button @click="mfaBindDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="mfaBinding" :disabled="mfaBindCode.trim().length !== 6" @click="confirmMfaBind">
          {{ t('settingsDialog.mfaConfirmBind') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mfaDisableDialogOpen"
      :title="t('settingsDialog.mfaDisable')"
      width="400px"
      append-to-body
      destroy-on-close
      @closed="resetMfaDisable"
    >
      <p class="hint">{{ t('settingsDialog.mfaDisableHint') }}</p>
      <el-form label-position="top">
        <el-form-item :label="t('settingsDialog.currentPassword')">
          <el-input v-model="mfaDisablePassword" type="password" show-password />
        </el-form-item>
        <el-form-item :label="t('login.mfaTitle')">
          <el-input v-model="mfaDisableCode" maxlength="6" :placeholder="t('login.mfaPlaceholder')" @keyup.enter="submitMfaDisable" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mfaDisableDialogOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="mfaDisabling" @click="submitMfaDisable">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

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
import QRCode from 'qrcode'
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

const totpEnabled = ref(false)
const mfaSetupPending = ref(false)

const mfaBindDialogVisible = ref(false)
const mfaQrDataUrl = ref('')
const mfaBindCode = ref('')
const mfaStarting = ref(false)
const mfaBinding = ref(false)
const mfaDisableDialogOpen = ref(false)
const mfaDisablePassword = ref('')
const mfaDisableCode = ref('')
const mfaDisabling = ref(false)

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

function syncMfaFromProfile(p: { totpEnabled?: boolean; mfaSetupPending?: boolean }) {
  totpEnabled.value = Boolean(p.totpEnabled)
  mfaSetupPending.value = Boolean(p.mfaSetupPending)
  authStore.updateUser({
    totpEnabled: totpEnabled.value,
    mfaSetupPending: mfaSetupPending.value
  })
}

async function onOpen() {
  loading.value = true
  emailEditing.value = false
  try {
    const p = await userApi.getProfile()
    emailBaseline.value = p.email ?? ''
    emailDraft.value = emailBaseline.value
    avatarPath.value = p.avatarUrl
    syncMfaFromProfile(p)
  } catch {
    emailBaseline.value = authStore.user?.email ?? ''
    emailDraft.value = emailBaseline.value
    avatarPath.value = authStore.user?.avatar ?? null
    totpEnabled.value = Boolean(authStore.user?.totpEnabled)
    mfaSetupPending.value = Boolean(authStore.user?.mfaSetupPending)
  } finally {
    loading.value = false
  }
}

function onMfaBindDialogClose() {
  mfaBindCode.value = ''
  mfaQrDataUrl.value = ''
}

async function startMfaSetup() {
  mfaStarting.value = true
  try {
    const { otpauthUrl } = await authApi.mfaSetupStart()
    mfaQrDataUrl.value = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 2 })
    mfaBindCode.value = ''
    mfaBindDialogVisible.value = true
    mfaSetupPending.value = true
    authStore.updateUser({ mfaSetupPending: true })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || 'MFA')
  } finally {
    mfaStarting.value = false
  }
}

async function confirmMfaBind() {
  const c = mfaBindCode.value.trim().replace(/\s/g, '')
  if (c.length !== 6) {
    ElMessage.warning(t('login.mfaPlaceholder'))
    return
  }
  mfaBinding.value = true
  try {
    await authApi.mfaSetupConfirm(c)
    totpEnabled.value = true
    mfaSetupPending.value = false
    mfaBindDialogVisible.value = false
    onMfaBindDialogClose()
    authStore.updateUser({ totpEnabled: true, mfaSetupPending: false })
    ElMessage.success(t('settingsDialog.mfaBoundSuccess'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('settingsDialog.passwordFailed'))
  } finally {
    mfaBinding.value = false
  }
}

async function cancelMfaSetup() {
  try {
    await authApi.mfaSetupCancel()
    mfaSetupPending.value = false
    mfaBindDialogVisible.value = false
    onMfaBindDialogClose()
    authStore.updateUser({ mfaSetupPending: false })
    ElMessage.success(t('common.save'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('settingsDialog.saveFailed'))
  }
}

function resetMfaDisable() {
  mfaDisablePassword.value = ''
  mfaDisableCode.value = ''
}

async function submitMfaDisable() {
  const p = mfaDisablePassword.value
  const c = mfaDisableCode.value.trim().replace(/\s/g, '')
  if (!p || c.length !== 6) {
    ElMessage.warning(t('settingsDialog.mfaDisableHint'))
    return
  }
  mfaDisabling.value = true
  try {
    await authApi.mfaDisable(p, c)
    totpEnabled.value = false
    mfaSetupPending.value = false
    mfaDisableDialogOpen.value = false
    resetMfaDisable()
    authStore.updateUser({ totpEnabled: false, mfaSetupPending: false })
    ElMessage.success(t('settingsDialog.mfaDisabled'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    ElMessage.error(err.response?.data?.message || t('settingsDialog.passwordFailed'))
  } finally {
    mfaDisabling.value = false
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

.mfa-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.section-sub {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.mfa-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.hint.warn {
  color: var(--el-color-warning);
}

.mfa-qr-wrap {
  display: flex;
  justify-content: center;
  margin: 12px 0;
}

.mfa-qr {
  width: 220px;
  height: 220px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.mfa-code-input {
  margin-top: 8px;
}
</style>
