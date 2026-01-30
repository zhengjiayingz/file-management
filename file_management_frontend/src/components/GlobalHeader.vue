<template>
    <el-header class="global-header" height="60px">
        <div class="header-content">
            <div class="header-left">
                <slot name="left"></slot>
            </div>
            <div class="header-right">
                <slot name="right"></slot>

                <!-- 语言切换 -->
                <el-dropdown @command="handleLanguageChange" trigger="click" style="margin-right: 15px">
                    <span class="el-dropdown-link">
                        {{ locale === 'zh-CN' ? '简体中文' : (locale === 'zh-TW' ? '繁體中文' : 'English') }}
                        <el-icon class="el-icon--right">
                            <ArrowDown />
                        </el-icon>
                    </span>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="zh-CN">简体中文</el-dropdown-item>
                            <el-dropdown-item command="zh-TW">繁體中文</el-dropdown-item>
                            <el-dropdown-item command="en-US">English</el-dropdown-item>
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
                        <el-icon>
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
                            <el-dropdown-item command="settings">{{ t('common.settings') || '设置' }}</el-dropdown-item>
                            <el-dropdown-item divided command="logout">{{ t('common.logout') || '退出登录'
                                }}</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </div>
        </div>
    </el-header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, ArrowDown, Sunny, Moon, Monitor } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { authApi } from '../api/auth'
import { useI18n } from 'vue-i18n'
import type { ThemeMode } from '../stores/theme'
import userPreferenceApi from '../api/user-preference'

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const { t, locale } = useI18n()

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

const handleCommand = async (command: string) => {
    switch (command) {
        case 'profile':
            ElMessage.info(t('common.profile') || '个人信息功能开发中...')
            break
        case 'settings':
            ElMessage.info(t('common.settings') || '设置功能开发中...')
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
    background: white;
    border-bottom: 1px solid #e4e7ed;
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
    }

    .header-right {
        display: flex;
        align-items: center;
    }
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
}
</style>
