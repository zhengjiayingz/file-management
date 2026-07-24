<template>
    <el-aside class="sidebar" width="200px">
        <div class="sidebar-header">
            <h2 class="logo">{{ t('login.title') }}</h2>
        </div>
        <el-menu :default-active="activeMenu" class="sidebar-menu" :background-color="menuColors.background"
            :text-color="menuColors.text" :active-text-color="menuColors.activeText">
            <el-menu-item index="1" @click="router.push('/')">
                <el-icon>
                    <Folder />
                </el-icon>
                <span>{{ t('sidebar.home') }}</span>
            </el-menu-item>
            <el-sub-menu index="categories">
                <template #title>
                    <el-icon>
                        <Collection />
                    </el-icon>
                    <span>{{ t('sidebar.categories') }}</span>
                </template>
                <el-menu-item index="file-type-image" @click="router.push('/?type=image')">
                    <el-icon>
                        <Picture />
                    </el-icon>
                    <span>{{ t('sidebar.images') }}</span>
                </el-menu-item>
                <el-menu-item index="file-type-video" @click="router.push('/?type=video')">
                    <el-icon>
                        <VideoPlay />
                    </el-icon>
                    <span>{{ t('sidebar.videos') }}</span>
                </el-menu-item>
                <el-menu-item index="file-type-audio" @click="router.push('/?type=audio')">
                    <el-icon>
                        <Headset />
                    </el-icon>
                    <span>{{ t('sidebar.audio') }}</span>
                </el-menu-item>
                <el-menu-item index="file-type-document" @click="router.push('/?type=document')">
                    <el-icon>
                        <Document />
                    </el-icon>
                    <span>{{ t('sidebar.documents') }}</span>
                </el-menu-item>
            </el-sub-menu>
            <el-menu-item index="4" @click="router.push('/recycle-bin')">
                <el-icon>
                    <Delete />
                </el-icon>
                <span>{{ t('sidebar.recycleBin') }}</span>
            </el-menu-item>
            <el-menu-item index="5" @click="router.push('/logs')">
                <el-icon>
                    <List />
                </el-icon>
                <span>{{ t('sidebar.logs') }}</span>
            </el-menu-item>
            <el-menu-item index="transfer-records" @click="router.push('/transfer-records')">
                <el-icon>
                    <Upload />
                </el-icon>
                <span>{{ t('sidebar.transferRecords') }}</span>
            </el-menu-item>
            <el-menu-item index="knowledge-bases" @click="router.push('/knowledge-bases')">
                <el-icon>
                    <Collection />
                </el-icon>
                <span>{{ t('sidebar.knowledgeBases') }}</span>
            </el-menu-item>
            <el-menu-item index="wrong-questions" @click="router.push('/wrong-questions')">
                <el-icon>
                    <Notebook />
                </el-icon>
                <span>{{ t('sidebar.wrongBook') }}</span>
            </el-menu-item>
            <el-menu-item index="tts" @click="router.push('/tts')">
                <el-icon>
                    <Microphone />
                </el-icon>
                <span>{{ t('sidebar.tts') }}</span>
            </el-menu-item>
            <el-menu-item index="assistant" @click="router.push('/assistant')">
                <el-icon>
                    <ChatLineRound />
                </el-icon>
                <span>{{ t('sidebar.assistant') }}</span>
            </el-menu-item>
            <!-- 阶段 B 联调页：暂隐藏；需要时恢复或访问 /dev/math-temp
            <el-menu-item index="math-temp-lab" @click="router.push('/dev/math-temp')">
                <el-icon>
                    <Camera />
                </el-icon>
                <span>{{ t('sidebar.mathTempLab') }}</span>
            </el-menu-item>
            -->
            <el-menu-item index="my-shares" @click="openMyShares">
                <el-icon>
                    <Share />
                </el-icon>
                <span>{{ t('sidebar.myShares') }}</span>
            </el-menu-item>
            <el-menu-item index="admin" v-if="authStore.user?.role === 'admin'" @click="router.push('/admin')">
                <el-icon>
                    <Setting />
                </el-icon>
                <span>{{ t('sidebar.adminDashboard') }}</span>
            </el-menu-item>
            <el-menu-item index="chat" class="menu-item-chat" @click="openFriendPanel">
                <el-icon>
                    <ChatDotRound />
                </el-icon>
                <el-badge :value="messageUnreadStore.totalUnread" :max="99"
                    :hidden="messageUnreadStore.totalUnread === 0" class="chat-menu-badge">
                    <span class="chat-menu-label">{{ t('sidebar.contactsAndMessages') }}</span>
                </el-badge>
            </el-menu-item>
        </el-menu>
    </el-aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Folder, Delete, List, Upload, Picture, VideoPlay, Headset, Document, Collection, Setting, ChatDotRound, Share, Notebook, Microphone, ChatLineRound } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@stores/theme'
import { useAuthStore } from '@stores/auth'
import { useMessageUnreadStore } from '@stores/messageUnread'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const themeStore = useThemeStore()
const authStore = useAuthStore()
const messageUnreadStore = useMessageUnreadStore()

const openFriendPanel = () => {
    window.dispatchEvent(new CustomEvent('open-friend-panel'))
}

const openMyShares = () => {
    window.dispatchEvent(new CustomEvent('open-my-shares'))
}

const activeMenu = computed(() => {
    const path = route.path
    const query = route.query
    if (path.startsWith('/admin')) return 'admin'
    if (path.startsWith('/recycle-bin')) return '4'
    if (path.startsWith('/logs')) return '5'
    if (path.startsWith('/transfer-records')) return 'transfer-records'
    if (path.startsWith('/knowledge-bases')) return 'knowledge-bases'
    if (path.startsWith('/wrong-questions')) return 'wrong-questions'
    if (path.startsWith('/tts')) return 'tts'
    if (path.startsWith('/assistant')) return 'assistant'
    if (path === '/' && query.type) {
        return `file-type-${query.type}`
    }
    return '1' // Default to home/files
})

// 根据主题动态设置菜单颜色
const menuColors = computed(() => {
    if (themeStore.currentTheme === 'dark') {
        return {
            background: '#242424',
            text: '#e5e5e5',
            activeText: '#409eff'
        }
    }
    return {
        background: '#f8f9fa',
        text: '#333',
        activeText: '#409eff'
    }
})
</script>

<style lang="scss" scoped>
.sidebar {
    background-color: #f8f9fa;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e4e7ed;

    &-header {
        height: 60px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        border-bottom: 1px solid #e4e7ed;
        background: white;

        .logo {
            margin: 0;
            font-size: 18px;
            color: #303133;
            font-weight: 600;
        }
    }

    &-menu {
        border-right: none;
        flex: 1;

        .menu-item-chat {
            :deep(.chat-menu-badge) {
                flex: 1;
                min-width: 0;
                display: inline-flex;
                align-items: center;

                .chat-menu-label {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .el-badge__content {
                    top: 2px;
                    right: 10px;
                }
            }
        }

        :deep(.el-menu-item) {
            &.is-active {
                background-color: #e6f6ff;
                border-right: 3px solid #409eff;
            }
        }
    }
}

/* 深色模式样式 */
html.dark .sidebar {
    background-color: #242424;
    border-right-color: #3a3a3a;

    &-header {
        background-color: #242424;
        border-bottom-color: #3a3a3a;

        .logo {
            color: #e5e5e5;
        }
    }

    .sidebar-menu {
        :deep(.el-menu-item) {
            &.is-active {
                background-color: #1a3a52;
                border-right-color: #409eff;
            }

            &:hover {
                background-color: #2a2a2a;
            }
        }
    }
}
</style>
