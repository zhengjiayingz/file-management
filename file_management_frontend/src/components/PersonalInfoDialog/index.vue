<template>
  <el-dialog
    v-model="visible"
    :title="t('profileDialog.title')"
    width="520px"
    destroy-on-close
    class="personal-info-dialog"
    @open="onOpen"
  >
    <div v-loading="loading" class="profile-body">
      <template v-if="profile">
        <div class="avatar-row">
          <el-avatar :size="72" :src="avatarFullUrl || undefined">
            {{ profile.username?.charAt(0)?.toUpperCase() }}
          </el-avatar>
          <p v-if="!profile.avatarUrl" class="avatar-hint">{{ t('profileDialog.avatarHint') }}</p>
        </div>
        <dl class="profile-fields">
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.username') }}</dt>
            <dd class="field-value">{{ profile.username }}</dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.userId') }}</dt>
            <dd class="field-value">{{ profile.id }}</dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.registeredAt') }}</dt>
            <dd class="field-value">{{ formatDate(profile.createdAt) }}</dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.role') }}</dt>
            <dd class="field-value">{{ roleLabel(profile.role) }}</dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.email') }}</dt>
            <dd class="field-value">{{ profile.email || '—' }}</dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.storage') }}</dt>
            <dd class="field-value">
              {{ formatBytes(profile.storageUsed) }} / {{ formatQuota(profile.storageQuota) }}
            </dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.vipStatus') }}</dt>
            <dd class="field-value">{{ vipText }}</dd>
          </div>
          <div class="field-row">
            <dt class="field-label">{{ t('profileDialog.accountStatus') }}</dt>
            <dd class="field-value">{{ statusLabel(profile.status) }}</dd>
          </div>
        </dl>
        <div class="actions">
          <el-button type="primary" @click="openVip">{{ t('profileDialog.openVipCenter') }}</el-button>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { userApi, type UserProfileDTO } from '@api/user'
import { publicAssetUrl } from '@utils/publicAssetUrl'
import type { UserRole } from '@typing/user'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  openVip: []
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const profile = ref<UserProfileDTO | null>(null)

const avatarFullUrl = computed(() => publicAssetUrl(profile.value?.avatarUrl))

const vipText = computed(() => {
  const p = profile.value
  if (!p) return ''
  if (p.role === 'vip' && p.vipExpireAt) {
    return t('profileDialog.vipUntil', { date: formatDate(p.vipExpireAt) })
  }
  if (p.role === 'vip') {
    return t('profileDialog.vipNoExpire')
  }
  return t('profileDialog.notVip')
})

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatQuota(n: number): string {
  if (n === -1) return t('profileDialog.unlimited')
  return formatBytes(n)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function roleLabel(role: UserRole): string {
  const key = `admin.userManagement.roles.${role}` as const
  return t(key)
}

function statusLabel(status: string): string {
  if (status === 'active') return t('profileDialog.statusActive')
  if (status === 'disabled') return t('profileDialog.statusDisabled')
  return status
}

async function onOpen() {
  loading.value = true
  profile.value = null
  try {
    profile.value = await userApi.getProfile()
  } finally {
    loading.value = false
  }
}

function openVip() {
  visible.value = false
  emit('openVip')
}
</script>

<style scoped lang="scss">
.profile-body {
  min-height: 120px;
}

.avatar-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.avatar-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.profile-fields {
  margin: 0;
  padding: 0 4px;
}

.field-row {
  display: flex;
  align-items: flex-start;
  gap: 12px 16px;
  padding: 7px 0;
}

.field-label {
  flex: 0 0 11rem;
  max-width: 42%;
  margin: 0;
  padding-top: 1px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  text-align: right;
}

.field-value {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.actions {
  margin-top: 20px;
  text-align: center;
}
</style>
