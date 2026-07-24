<template>
    <el-header class="global-header" height="60px">
        <div class="header-content">
            <div class="header-left">
                <slot name="left"></slot>
            </div>
            <div class="header-right">
                <slot name="right"></slot>

                <!-- 会员中心 + 空间额度（参考网盘头部） -->
                <div v-if="authStore.user" class="member-storage-block">
                    <el-link type="primary" :underline="false" class="member-center-link" @click="vipDialogVisible = true">
                        {{ t('header.memberCenter') }}
                    </el-link>
                    <div class="quota-wrap" v-if="authStore.user.storageQuota !== -1">
                        <span class="quota-text">
                            {{ formatBytes(authStore.user.storageUsed) }} / {{ formatBytes(authStore.user.storageQuota) }}
                        </span>
                        <el-progress
                            :percentage="storagePct"
                            :show-text="false"
                            :stroke-width="5"
                            :status="storagePct > 90 ? 'exception' : storagePct > 75 ? 'warning' : 'success'"
                            class="quota-bar"
                        />
                    </div>
                    <div v-else class="quota-wrap">
                        <span class="quota-text">{{ t('header.quotaUsedUnlimited', { used: formatBytes(authStore.user.storageUsed) }) }}</span>
                    </div>
                </div>

                <!-- 语言切换 -->
                <el-dropdown @command="handleLanguageChange" trigger="click" style="margin-right: 15px">
                    <span class="el-dropdown-link">
                        {{ locale === 'zh-CN' ? t('header.langZhCN') : (locale === 'zh-TW' ? t('header.langZhTW') : t('header.langEn')) }}
                        <el-icon class="el-icon--right">
                            <ArrowDown />
                        </el-icon>
                    </span>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="zh-CN">{{ t('header.langZhCN') }}</el-dropdown-item>
                            <el-dropdown-item command="zh-TW">{{ t('header.langZhTW') }}</el-dropdown-item>
                            <el-dropdown-item command="en-US">{{ t('header.langEn') }}</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>

                <!-- 主题切换 -->
                <el-dropdown @command="handleThemeChange" trigger="click" style="margin-right: 15px">
                    <span class="el-dropdown-link">
                        <el-icon>
                            <Sunny v-if="themeStore.themeMode === 'light'" />
                            <Moon v-else-if="themeStore.themeMode === 'dark'" />
                            <Monitor v-else />
                        </el-icon>
                        <el-icon class="el-icon--right">
                            <ArrowDown />
                        </el-icon>
                    </span>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="light">
                                <el-icon>
                                    <Sunny />
                                </el-icon>
                                {{ t('theme.light') }}
                            </el-dropdown-item>
                            <el-dropdown-item command="dark">
                                <el-icon>
                                    <Moon />
                                </el-icon>
                                {{ t('theme.dark') }}
                            </el-dropdown-item>
                            <el-dropdown-item command="auto">
                                <el-icon>
                                    <Monitor />
                                </el-icon>
                                {{ t('theme.auto') }}
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>

                <!-- 用户下拉菜单 -->
                <el-dropdown @command="handleCommand">
                    <span class="user-dropdown">
                        <el-avatar v-if="authStore.user" :size="28" :src="userAvatarSrc || undefined" class="user-avatar">
                            {{ authStore.user.username?.charAt(0)?.toUpperCase() }}
                        </el-avatar>
                        <el-icon v-else>
                            <User />
                        </el-icon>
                        {{ authStore.user?.username }}
                        <el-icon class="el-icon--right">
                            <ArrowDown />
                        </el-icon>
                    </span>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="profile">{{ t('common.profile') || '个人信息' }}</el-dropdown-item>
                            <el-dropdown-item command="myShares">{{ t('header.myShares') }}</el-dropdown-item>
                            <el-dropdown-item command="sessionManage">{{ t('header.sessionManage') }}</el-dropdown-item>
                            <el-dropdown-item command="settings">{{ t('common.settings') || '设置' }}</el-dropdown-item>
                            <el-dropdown-item divided command="logout">{{ t('common.logout') || '退出登录'
                            }}</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </div>
        </div>

        <VipCenterDialog v-model="vipDialogVisible" />
        <PersonalInfoDialog v-model="profileDialogVisible" @open-vip="openVipFromProfile" />
        <UserSettingsDialog v-model="settingsDialogVisible" />
        <MySharesDialog v-model="mySharesDialogVisible" />
        <SessionManageDialog v-model="sessionManageDialogVisible" />
    </el-header>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, ArrowDown, Sunny, Moon, Monitor } from '@element-plus/icons-vue'
import { useAuthStore } from '@stores/auth'
import { useThemeStore } from '@stores/theme'
import { authApi } from '@api/auth'
import { useI18n } from 'vue-i18n'
import type { ThemeMode } from '@stores/theme'
import userPreferenceApi from '@api/user-preference'
import VipCenterDialog from '@components/VipCenterDialog/index.vue'
import PersonalInfoDialog from '@components/PersonalInfoDialog/index.vue'
import UserSettingsDialog from '@components/UserSettingsDialog/index.vue'
import MySharesDialog from '@components/MySharesDialog/index.vue'
import SessionManageDialog from '@components/SessionManageDialog/index.vue'
import { publicAssetUrl } from '@utils/publicAssetUrl'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const { t, locale } = useI18n()

const vipDialogVisible = ref(false)
const profileDialogVisible = ref(false)
const settingsDialogVisible = ref(false)
const mySharesDialogVisible = ref(false)
const sessionManageDialogVisible = ref(false)

const openMySharesFromSidebar = () => {
    mySharesDialogVisible.value = true
}

/** 登录页「升级为 VIP」跳转 `/?openVip=1` 后，在此打开会员中心并去掉 query，避免刷新重复弹出 */
watch(
    () => [route.query.openVip, authStore.user] as const,
    () => {
        if (route.query.openVip !== '1' || !authStore.user) return
        vipDialogVisible.value = true
        const next = { ...route.query } as Record<string, string | string[] | undefined>
        delete next.openVip
        router.replace({ path: route.path, query: next })
    },
    { immediate: true }
)

onMounted(() => {
    window.addEventListener('open-my-shares', openMySharesFromSidebar)
})

onUnmounted(() => {
    window.removeEventListener('open-my-shares', openMySharesFromSidebar)
})

const userAvatarSrc = computed(() => publicAssetUrl(authStore.user?.avatar))

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const storagePct = computed(() => {
    const u = authStore.user
    if (!u || u.storageQuota <= 0 || u.storageQuota === -1) return 0
    return Math.min(100, Math.round((u.storageUsed / u.storageQuota) * 100))
})

const handleLanguageChange = async (lang: string) => {
    locale.value = lang
    localStorage.setItem('locale', lang)

    // 保存到数据库
    try {
        await userPreferenceApi.updatePreference({ locale: lang as any })
    } catch (error) {
        console.error('保存语言设置失败:', error)
        // 即使保存失败也不影响用户体验，已经保存到 localStorage
    }
}

const handleThemeChange = async (mode: string) => {
    themeStore.setThemeMode(mode as ThemeMode)

    // 保存到数据库
    try {
        await userPreferenceApi.updatePreference({ theme: mode as any })
    } catch (error) {
        console.error('保存主题设置失败:', error)
        // 即使保存失败也不影响用户体验，已经保存到 localStorage
    }
}

function openVipFromProfile() {
    vipDialogVisible.value = true
}

const handleCommand = async (command: string) => {
    switch (command) {
        case 'profile':
            profileDialogVisible.value = true
            break
        case 'myShares':
            mySharesDialogVisible.value = true
            break
        case 'sessionManage':
            sessionManageDialogVisible.value = true
            break
        case 'settings':
            settingsDialogVisible.value = true
            break
        case 'logout':
            try {
                if (authStore.refreshToken) {
                    await authApi.logout(authStore.refreshToken)
                }
            } catch (error) {
                console.error('登出API调用失败:', error)
            }

            // 清除用户数据和设置
            authStore.logout()
            ElMessage.success(t('common.logout') || '已退出登录')

            // 跳转到登录页并刷新以应用浏览器默认语言
            await router.push('/login')
            window.location.reload()
            break
    }
}
</script>

<style lang="scss" scoped>
.global-header {
    background: var(--el-bg-color);
    border-bottom: 1px solid var(--el-border-color-light);
    padding: 0 20px;

    .header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 100%;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 12px;

        /* 插槽内容来自父组件，需 :deep 才能应用主题主色（深色模式为浅色字） */
        :deep(h1),
        :deep(h2),
        :deep(h3),
        :deep(h4) {
            margin: 0;
            font-weight: 500;
            color: var(--el-text-color-primary);
        }
    }

    .header-right {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
    }
}

.member-storage-block {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-right: 12px;
    padding: 4px 12px;
    border-radius: 8px;
    background: #f7f8fa;
    border: 1px solid #ebeef5;
}

.member-center-link {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
}

.quota-wrap {
    min-width: 140px;
    max-width: 220px;
}

.quota-text {
    display: block;
    font-size: 12px;
    color: #606266;
    line-height: 1.2;
    margin-bottom: 4px;
}

.quota-bar {
    width: 100%;
}

.el-dropdown-link {
    cursor: pointer;
    display: flex;
    align-items: center;
    font-size: 14px;
    color: #606266;
    padding: 8px 12px;
    border-radius: 4px;
    transition: background-color 0.3s;

    &:hover {
        background-color: #f5f7fa;
    }
}

.user-dropdown {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #606266;
    font-size: 14px;
    padding: 8px 12px;
    border-radius: 4px;
    transition: background-color 0.3s;

    &:hover {
        background-color: #f5f7fa;
    }

    .el-icon {
        margin: 0 4px;
    }

    .user-avatar {
        flex-shrink: 0;
        margin-right: 2px;
    }
}
</style>
