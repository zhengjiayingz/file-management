<template>
    <div class="friend-panel-wrapper">
        <!-- 悬浮通讯按钮 -->
        <div class="floating-chat-btn" @click="toggleDrawer" :title="t('sidebar.contactsAndMessages')">
            <el-badge :value="totalUnread > 0 ? totalUnread : ''" :hidden="totalUnread === 0" class="chat-badge">
                <el-button type="primary" circle size="large" class="shadow-btn">
                    <el-icon size="20">
                        <Message />
                    </el-icon>
                </el-button>
            </el-badge>
        </div>

        <!-- 侧边栏抽屉 -->
        <el-drawer v-model="drawerVisible" :title="panelHeaderTitle"
            size="380px" :with-header="true">
            <!-- 为了自定义Header返回按钮 -->
            <template #header="{ close, titleId, titleClass }">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <el-button v-if="currentChatFriend" icon="ArrowLeft" circle size="small"
                            @click="currentChatFriend = null; loadData()" />
                        <h4 :id="titleId" :class="titleClass" style="margin: 0; color: #303133;">
                            {{ panelHeaderTitle }}
                        </h4>
                    </div>
                </div>
            </template>

            <!-- 主视图 (非聊天界面) -->
            <div v-if="!currentChatFriend" class="panel-body">
                <el-tabs v-model="activeTab" class="custom-tabs">
                    <el-tab-pane :label="t('friendPanel.tabFriends')" name="friends">
                        <!-- 待处理请求提示 -->
                        <div v-if="pendingRequests.length > 0" class="pending-alert" @click="activeTab = 'requests'">
                            <el-icon color="#E6A23C">
                                <Bell />
                            </el-icon>
                            <span>{{ t('friendPanel.pendingRequestsHint', { count: pendingRequests.length }) }}</span>
                            <el-icon>
                                <ArrowRight />
                            </el-icon>
                        </div>

                        <div class="list-container">
                            <el-empty v-if="friends.length === 0" :description="t('friendPanel.noFriends')" :image-size="60" />
                            <div v-for="friend in friends" :key="friend.friendId" class="friend-item"
                                @click="openChat(friend)">
                                <el-avatar :size="40" style="background:#409EFF; font-weight: bold;">
                                    {{ friend.username.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ friend.username }}</span>
                                    <span class="email">{{ friend.email || t('friendPanel.noEmail') }}</span>
                                </div>
                                <el-badge :value="getUnreadCount(friend.friendId)"
                                    :hidden="getUnreadCount(friend.friendId) === 0" />
                            </div>
                        </div>
                    </el-tab-pane>

                    <el-tab-pane :label="t('friendPanel.tabAdd')" name="add">
                        <div class="search-box" style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <el-input v-model="searchKeyword" :placeholder="t('friendPanel.searchPlaceholder')" clearable
                                @keyup.enter="handleSearchUser" />
                            <el-button type="primary" @click="handleSearchUser" :loading="searching">
                                {{ t('friendPanel.search') }}
                            </el-button>
                        </div>
                        <div class="list-container" v-loading="searching">
                            <el-empty v-if="searchResults.length === 0 && searchPushed" :description="t('friendPanel.noSearchResults')"
                                :image-size="60" />
                            <div v-for="user in searchResults" :key="user.id" class="friend-item result-item">
                                <el-avatar :size="40" style="background:#67C23A">
                                    {{ user.username.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ user.username }} (ID: {{ user.id }})</span>
                                </div>
                                <el-button size="small" type="primary" plain
                                    @click="sendFriendRequest(user)">{{ t('friendPanel.addFriend') }}</el-button>
                            </div>
                        </div>
                    </el-tab-pane>

                    <el-tab-pane :label="t('friendPanel.tabRequests', { count: pendingRequests.length })" name="requests">
                        <div class="list-container">
                            <el-empty v-if="pendingRequests.length === 0" description="暂无请求" :image-size="60" />
                            <div v-for="req in pendingRequests" :key="req.requestId" class="friend-item result-item">
                                <el-avatar :size="40" style="background:#E6A23C">
                                    {{ req.senderUsername.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ req.senderUsername }}</span>
                                    <span class="email">{{ t('friendPanel.requestSubtitle') }}</span>
                                </div>
                                <div class="action-btns" style="display: flex; gap: 8px;">
                                    <el-button size="small" type="success"
                                        @click="handleRequest(req.requestId, true)">{{ t('friendPanel.approve') }}</el-button>
                                    <el-button size="small" type="danger" plain
                                        @click="handleRequest(req.requestId, false)">{{ t('friendPanel.reject') }}</el-button>
                                </div>
                            </div>
                        </div>
                    </el-tab-pane>

                    <el-tab-pane v-if="isAdmin" :label="t('friendPanel.tabVip', { count: vipPending.length })" name="vip">
                        <div class="list-container">
                            <el-empty v-if="vipPending.length === 0" :description="t('friendPanel.noVipRequests')" :image-size="60" />
                            <div v-for="row in vipPending" :key="row.id" class="friend-item result-item vip-req-row">
                                <el-avatar :size="40" style="background:#F56C6C">
                                    {{ row.username.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ row.username }}</span>
                                    <span class="email">{{ t('friendPanel.vipRequestSubtitle', { id: row.applicantId }) }}</span>
                                </div>
                                <div class="action-btns" style="display: flex; gap: 8px; flex-shrink: 0;">
                                    <el-button size="small" type="success" :loading="vipActionId === row.id"
                                        @click="handleVipApprove(row.id)">{{ t('friendPanel.approve') }}</el-button>
                                    <el-button size="small" type="danger" plain :loading="vipActionId === -row.id"
                                        @click="handleVipReject(row.id)">{{ t('friendPanel.reject') }}</el-button>
                                </div>
                            </div>
                        </div>
                    </el-tab-pane>
                </el-tabs>
            </div>

            <!-- 聊天视图 -->
            <div v-else class="chat-container">
                <div class="chat-history" ref="chatHistoryRef">
                    <div v-if="chatMessages.length === 0" class="empty-chat">
                        <span style="color:#909399; font-size:13px;">{{ t('friendPanel.emptyChat') }}</span>
                    </div>
                    <div v-for="msg in chatMessages" :key="msg.id" class="message-row"
                        :class="{ 'is-mine': msg.senderId === myUserId }">
                        <div class="message-bubble">
                            <!-- 文本消息 -->
                            <div v-if="msg.messageType === 'text'" class="text-content">
                                <div class="text-lines">{{ msg.content }}</div>
                                <div
                                    v-if="isAdmin && isIncomingVipApplyMessage(msg)"
                                    class="vip-inline-actions"
                                >
                                    <el-button
                                        size="small"
                                        type="success"
                                        :loading="vipChatActionId === msg.senderId"
                                        @click="handleVipChatApprove(msg.senderId)"
                                    >
                                        {{ t('friendPanel.approve') }}
                                    </el-button>
                                    <el-button
                                        size="small"
                                        type="danger"
                                        plain
                                        :loading="vipChatActionId === -msg.senderId"
                                        @click="handleVipChatReject(msg.senderId)"
                                    >
                                        {{ t('friendPanel.reject') }}
                                    </el-button>
                                </div>
                            </div>
                            <!-- 文件消息 -->
                            <div v-else-if="msg.messageType === 'file' && msg.file" class="file-content"
                                @click="openSaveFilePicker(msg.file)">
                                <el-icon size="24" color="#409eff">
                                    <Document />
                                </el-icon>
                                <div class="file-info">
                                    <div class="file-name">{{ msg.file.fileName }}</div>
                                    <div class="file-meta">{{ t('friendPanel.saveToDrive') }}</div>
                                </div>
                            </div>
                            <!-- 异常文件类型处理 -->
                            <div v-else class="text-content">
                                {{ t('friendPanel.unsupportedMessage', { content: msg.content }) }}
                            </div>
                            <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
                        </div>
                    </div>
                </div>

                <div class="chat-input-area">
                    <div class="toolbar">
                        <el-button link type="primary" icon="FolderOpened" @click="openFilePicker">{{ t('friendPanel.shareFile') }}</el-button>
                    </div>
                    <div class="input-box">
                        <el-input v-model="messageText" type="textarea" :rows="3" resize="none"
                            :placeholder="t('friendPanel.messagePlaceholder')" @keydown.enter.prevent="handleSendMessage" />
                    </div>
                    <div class="action-bar">
                        <el-button type="primary" size="small" @click="handleSendMessage">{{ t('friendPanel.send') }}</el-button>
                    </div>
                </div>
            </div>
        </el-drawer>

        <!-- 分享文件选择器弹窗 -->
        <el-dialog v-model="filePickerVisible" :title="t('friendPanel.pickFileTitle')" width="600px" destroy-on-close>
            <div class="file-picker-container" v-loading="loadingFiles">
                <!-- 简单文件列表层级导航 -->
                <el-breadcrumb separator="/" style="margin-bottom:15px;">
                    <el-breadcrumb-item @click="pickFolder()" style="cursor: pointer;">{{ t('friendPanel.root') }}</el-breadcrumb-item>
                    <el-breadcrumb-item v-for="f in pickBreadcrumbs" :key="f.id" @click="pickFolder(f.id)"
                        style="cursor: pointer;">
                        {{ f.name }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <el-table :data="pickFiles" height="300" style="width: 100%" @row-click="handlePickFileRow">
                    <el-table-column :label="t('friendPanel.colName')">
                        <template #default="{ row }">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <el-icon size="18" :color="row.fileType === 'folder' ? '#ffd04b' : '#909399'">
                                    <Folder v-if="row.fileType === 'folder'" />
                                    <Document v-else />
                                </el-icon>
                                <span>{{ row.fileName }}</span>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column width="100">
                        <template #default="{ row }">
                            <el-button v-if="row.fileType === 'file'" type="primary" link
                                @click.stop="confirmShareFile(row)">{{ t('friendPanel.share') }}</el-button>
                            <el-button v-else type="info" link
                                @click.stop="pickFolder(row.id, row.fileName)">{{ t('friendPanel.enter') }}</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
        </el-dialog>

        <!-- 保存文件选择器弹窗 -->
        <el-dialog v-model="savePickerVisible" :title="t('friendPanel.savePickerTitle')" width="600px" destroy-on-close>
            <div class="file-picker-container" v-loading="loadingFiles">
                <!-- 简单文件列表层级导航 -->
                <el-breadcrumb separator="/" style="margin-bottom:15px;">
                    <el-breadcrumb-item @click="pickFolder()" style="cursor: pointer;">{{ t('friendPanel.root') }}</el-breadcrumb-item>
                    <el-breadcrumb-item v-for="f in pickBreadcrumbs" :key="f.id" @click="pickFolder(f.id)"
                        style="cursor: pointer;">
                        {{ f.name }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <el-table :data="onlyFolders" height="300" style="width: 100%" @row-click="handlePickFileRow">
                    <el-table-column :label="t('friendPanel.colName')">
                        <template #default="{ row }">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <el-icon size="18" color="#ffd04b">
                                    <Folder />
                                </el-icon>
                                <span>{{ row.fileName }}</span>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column width="100">
                        <template #default="{ row }">
                            <el-button type="info" link @click.stop="pickFolder(row.id, row.fileName)">{{ t('friendPanel.enter') }}</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="savePickerVisible = false">{{ t('common.cancel') }}</el-button>
                    <el-button type="primary" @click="confirmSaveFileHere" :loading="savingFile">
                        {{ t('friendPanel.saveToCurrentFolder') }}
                    </el-button>
                </span>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Message, Bell, ArrowRight, Search, Check, Close, ArrowLeft, Document, Folder, FolderOpened } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { friendshipApi } from '@api/friendship'
import { messageApi } from '@api/message'
import { userApi } from '@api/user'
import { useAuthStore } from '@stores/auth'
import { useMessageUnreadStore } from '@stores/messageUnread'
import fileApiService from '@api/file'
import type { FileItem } from '@typing/file'
import { useI18n } from 'vue-i18n'
import { vipApi } from '@api/vip'
import type { VipPendingItem } from '@api/vip'
import {
    connectContactsSocket,
    disconnectContactsSocket,
    setContactsSocketHandlers,
} from '@/realtime/contactsSocket'

const { t } = useI18n()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'admin')
const messageUnreadStore = useMessageUnreadStore()
const myUserId = computed(() => authStore.user?.id)

// 面板状态
const drawerVisible = ref(false)
const activeTab = ref('friends')

// 数据
const friends = ref<any[]>([])
const pendingRequests = ref<any[]>([])
const vipPending = ref<VipPendingItem[]>([])
const vipActionId = ref(0)
/** 聊天内快捷处理：正数为同意 loading 的 applicantId，负数为拒绝 */
const vipChatActionId = ref(0)
const unreadSummary = ref<any[]>([])

// 搜索
const searchKeyword = ref('')
const searching = ref(false)
const searchResults = ref<any[]>([])
const searchPushed = ref(false)

// 聊天
const currentChatFriend = ref<any>(null)
/** 抽屉标题：列表页为通讯录文案；聊天中为对方用户名 */
const panelHeaderTitle = computed(() => {
    if (currentChatFriend.value) {
        return currentChatFriend.value.username
    }
    return t('sidebar.contactsAndMessages')
})
const chatMessages = ref<any[]>([])
const messageText = ref('')
const chatHistoryRef = ref<HTMLElement | null>(null)
let summaryPollTimer: any = null

// 选择文件分享
const filePickerVisible = ref(false)
const pickFiles = ref<FileItem[]>([])
const loadingFiles = ref(false)
const pickBreadcrumbs = ref<{ id: number, name: string }[]>([])
const currentPickFolderId = ref<number | undefined>(undefined)

const totalUnread = computed(() => {
    return unreadSummary.value.reduce((acc, curr) => acc + curr._count.id, 0)
})

watch(
    totalUnread,
    (n) => messageUnreadStore.setTotalUnread(n),
    { immediate: true },
)

watch(
    () => authStore.isLoggedIn,
    (loggedIn) => {
        if (!loggedIn) messageUnreadStore.reset()
    },
)

const getUnreadCount = (friendId: number) => {
    const target = unreadSummary.value.find(u => u.senderId === friendId)
    return target ? target._count.id : 0
}

const toggleDrawer = () => {
    drawerVisible.value = !drawerVisible.value
    if (drawerVisible.value) {
        loadData()
    }
}

const openDrawerPanel = () => {
    if (!drawerVisible.value) {
        drawerVisible.value = true
        loadData()
    }
}

/** 抽屉关闭（含右上角 X）时退出当前聊天，避免仍按「会话打开」自动已读导致收不到未读提醒 */
watch(drawerVisible, (visible) => {
    if (!visible && currentChatFriend.value) {
        currentChatFriend.value = null
        chatMessages.value = []
        messageText.value = ''
        loadData()
    }
})

// 轮询基础数据(全量请求/未读数) - 建议10秒一次
const startGlobalPolling = () => {
    if (summaryPollTimer) clearInterval(summaryPollTimer)
    summaryPollTimer = setInterval(() => {
        if (authStore.isLoggedIn) {
            fetchUnreadSummary()
            fetchPendingRequests()
            fetchVipPending()
        }
    }, 10000)
}

const stopGlobalPolling = () => {
    if (summaryPollTimer) clearInterval(summaryPollTimer)
}

// 加载初始数据
const loadData = async () => {
    fetchFriends()
    fetchPendingRequests()
    fetchUnreadSummary()
    fetchVipPending()
}

const fetchVipPending = async () => {
    if (!isAdmin.value) {
        vipPending.value = []
        return
    }
    try {
        vipPending.value = await vipApi.listPending()
    } catch {
        vipPending.value = []
    }
}

const handleVipApprove = async (id: number) => {
    vipActionId.value = id
    try {
        await vipApi.approve(id)
        ElMessage.success(t('friendPanel.msg.vipApproved'))
        await fetchVipPending()
    } catch (e: unknown) {
        const ax = e as { response?: { data?: { message?: string } } }
        ElMessage.error(ax.response?.data?.message || t('friendPanel.msg.operationFailed'))
    } finally {
        vipActionId.value = 0
    }
}

const handleVipReject = async (id: number) => {
    vipActionId.value = -id
    try {
        await vipApi.reject(id)
        ElMessage.success(t('friendPanel.msg.vipRejected'))
        await fetchVipPending()
    } catch (e: unknown) {
        const ax = e as { response?: { data?: { message?: string } } }
        ElMessage.error(ax.response?.data?.message || t('friendPanel.msg.operationFailed'))
    } finally {
        vipActionId.value = 0
    }
}

/** 对方发来的、内容为 VIP 申请模板的文本消息 */
function isIncomingVipApplyMessage(msg: { messageType: string; content: string; senderId: number }): boolean {
    if (msg.messageType !== 'text' || !msg.content) return false
    if (msg.senderId === myUserId.value) return false
    return msg.content.trimStart().startsWith('[VIP升级申请]')
}

async function handleVipChatApprove(applicantId: number) {
    vipChatActionId.value = applicantId
    try {
        await vipApi.approveByApplicant(applicantId)
        ElMessage.success(t('friendPanel.msg.vipApprovedInChat'))
        await fetchVipPending()
        await loadChatHistory()
    } catch (e: unknown) {
        const ax = e as { response?: { data?: { message?: string } } }
        ElMessage.error(ax.response?.data?.message || t('friendPanel.msg.operationFailed'))
    } finally {
        vipChatActionId.value = 0
    }
}

async function handleVipChatReject(applicantId: number) {
    vipChatActionId.value = -applicantId
    try {
        await vipApi.rejectByApplicant(applicantId)
        ElMessage.success(t('friendPanel.msg.vipRejected'))
        await fetchVipPending()
        await loadChatHistory()
    } catch (e: unknown) {
        const ax = e as { response?: { data?: { message?: string } } }
        ElMessage.error(ax.response?.data?.message || t('friendPanel.msg.operationFailed'))
    } finally {
        vipChatActionId.value = 0
    }
}

const fetchFriends = async () => {
    try {
        const res = await friendshipApi.getFriends()
        const payload = res.data || res
        friends.value = Array.isArray(payload) ? payload : (payload.data || [])
    } catch (error) { }
}

const fetchPendingRequests = async () => {
    try {
        const res = await friendshipApi.getPendingRequests()
        const payload = res.data || res
        pendingRequests.value = Array.isArray(payload) ? payload : (payload.data || [])
    } catch (error) { }
}

const fetchUnreadSummary = async () => {
    try {
        const res = await messageApi.getUnreadSummary()
        unreadSummary.value = res.data || res
    } catch (error) { }
}

// 搜索用户
const handleSearchUser = async () => {
    if (!searchKeyword.value.trim()) return
    searching.value = true
    searchPushed.value = true
    try {
        const res = await userApi.search(searchKeyword.value.trim())
        // 从 axios 或者 拦截器 响应中安全提取用户数组
        let rawUsers = []
        if (Array.isArray(res)) {
            rawUsers = res
        } else if (res.data && Array.isArray(res.data)) {
            rawUsers = res.data
        } else if (res.data && res.data.data && Array.isArray(res.data.data)) {
            rawUsers = res.data.data
        }

        // 过滤掉已经是好友的和自己
        const friendIds = friends.value.map(f => f.friendId)
        searchResults.value = rawUsers.filter((u: any) => !friendIds.includes(u.id))
    } catch (error: any) {
        ElMessage.error(t('friendPanel.msg.searchFailed'))
    } finally {
        searching.value = false
    }
}

const sendFriendRequest = async (user: any) => {
    try {
        await friendshipApi.sendRequest({ friendId: user.id })
        ElMessage.success(t('friendPanel.msg.requestSent'))
        // 将该用户从搜索结果中移除
        searchResults.value = searchResults.value.filter(u => u.id !== user.id)
    } catch (error: any) {
        ElMessage.error(error.response?.data?.message || t('friendPanel.msg.sendFailed'))
    }
}

const handleSocketMessageNew = async (payload: { message?: Record<string, unknown> }) => {
    const m = payload?.message as
        | {
              id: number
              senderId: number
              receiverId: number
              messageType: string
              content: string
              createdAt: string
              file?: { id: number; fileName: string; fileType: string }
          }
        | undefined
    if (!m) return
    const uid = myUserId.value
    const fid = currentChatFriend.value?.friendId
    /** 抽屉打开且正在看该好友会话时，对方发来的消息视为已读；抽屉仅隐藏但未退出会话的问题由关闭时清空 currentChatFriend 解决 */
    const incomingInOpenChat =
        drawerVisible.value &&
        fid != null &&
        uid != null &&
        m.senderId === fid &&
        m.receiverId === uid

    if (fid && (m.senderId === fid || m.receiverId === fid)) {
        const exists = chatMessages.value.some((x: { id: number }) => x.id === m.id)
        if (!exists) {
            chatMessages.value.push(m as (typeof chatMessages.value)[number])
            scrollToBottom()
        }
    }

    if (incomingInOpenChat) {
        try {
            await messageApi.markAsRead(fid)
        } catch {
            /* 忽略，仍刷新汇总 */
        }
    }

    fetchUnreadSummary()
}

const handleSocketFriendshipSync = () => {
    fetchFriends()
    fetchPendingRequests()
}

const handleRequest = async (requestId: number, accept: boolean) => {
    try {
        if (accept) {
            await friendshipApi.acceptRequest(requestId)
            ElMessage.success(t('friendPanel.msg.friendAdded'))
        } else {
            await friendshipApi.rejectRequest(requestId)
            ElMessage.success(t('friendPanel.msg.friendRejectShort'))
        }
        await fetchPendingRequests()
        await fetchFriends()
    } catch (error: any) {
        ElMessage.error(error.response?.data?.message || t('friendPanel.msg.operationFailed'))
    }
}

// --- 聊天相关 ---
const openChat = (friend: any) => {
    currentChatFriend.value = friend
    messageText.value = ''
    chatMessages.value = []

    // 标记已读
    if (getUnreadCount(friend.friendId) > 0) {
        messageApi.markAsRead(friend.friendId).then(() => fetchUnreadSummary())
    }

    loadChatHistory()
}

const loadChatHistory = async (scroll = true) => {
    if (!currentChatFriend.value) return
    try {
        const res = await messageApi.getHistory(currentChatFriend.value.friendId)
        chatMessages.value = res.data || res

        if (scroll) {
            scrollToBottom()
        }
    } catch (error) { }
}

const scrollToBottom = () => {
    nextTick(() => {
        if (chatHistoryRef.value) {
            chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight + 100
        }
    })
}

const handleSendMessage = async () => {
    if (!messageText.value.trim() && !currentChatFriend.value) return
    const text = messageText.value.trim()
    messageText.value = '' // optimistic clear
    try {
        await messageApi.send({
            receiverId: currentChatFriend.value.friendId,
            content: text,
            messageType: 'text'
        })
        loadChatHistory(true)
    } catch (e) {
        ElMessage.error(t('friendPanel.msg.sendMessageFailed'))
    }
}

const formatTime = (ts: string) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}-${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// --- 文件分享 ---
const openFilePicker = () => {
    filePickerVisible.value = true
    pickFolder(undefined)
}

const pickFolder = async (folderId?: number, folderName?: string) => {
    currentPickFolderId.value = folderId
    if (folderId === undefined) {
        pickBreadcrumbs.value = []
    } else if (folderName) {
        const idx = pickBreadcrumbs.value.findIndex(b => b.id === folderId)
        if (idx !== -1) pickBreadcrumbs.value = pickBreadcrumbs.value.slice(0, idx + 1)
        else pickBreadcrumbs.value.push({ id: folderId, name: folderName })
    }

    // Load Files
    loadingFiles.value = true
    try {
        const res = await fileApiService.getFiles({ parentId: folderId })
        pickFiles.value = res
    } catch (e) {
        ElMessage.error(t('friendPanel.msg.loadFilesFailed'))
    } finally {
        loadingFiles.value = false
    }
}

const handlePickFileRow = (row: FileItem) => {
    if (row.fileType === 'folder') {
        pickFolder(row.id, row.fileName)
    }
}

const confirmShareFile = async (item: FileItem) => {
    try {
        await messageApi.send({
            receiverId: currentChatFriend.value.friendId,
            content: `[分享文件] ${item.fileName}`,
            messageType: 'file',
            fileId: item.id
        })
        ElMessage.success(t('friendPanel.msg.fileShared'))
        filePickerVisible.value = false
        loadChatHistory(true)
    } catch (e: any) {
        ElMessage.error(t('friendPanel.msg.shareFailed'))
    }
}

const savePickerVisible = ref(false)
const savingFile = ref(false)
const currentSavingSourceFileId = ref<number | null>(null)
const onlyFolders = computed(() => pickFiles.value.filter(f => f.fileType === 'folder'))

const openSaveFilePicker = (fileDoc: any) => {
    currentSavingSourceFileId.value = fileDoc.id
    savePickerVisible.value = true
    pickFolder(undefined)
}

const confirmSaveFileHere = async () => {
    if (!currentSavingSourceFileId.value) return
    savingFile.value = true
    try {
        await fileApiService.saveSharedFileToMyDrive(
            currentSavingSourceFileId.value,
            currentPickFolderId.value
        )
        ElMessage.success(t('friendPanel.msg.savedToDrive'))
        savePickerVisible.value = false
    } catch (e: any) {
        ElMessage.error(e.response?.data?.message || t('friendPanel.msg.saveFailed'))
    } finally {
        savingFile.value = false
    }
}

onMounted(() => {
    setContactsSocketHandlers({
        onMessageNew: handleSocketMessageNew,
        onFriendshipSync: handleSocketFriendshipSync,
    })
    if (authStore.isLoggedIn && authStore.token) {
        connectContactsSocket(authStore.token)
        fetchUnreadSummary()
    }
    startGlobalPolling()
    window.addEventListener('open-friend-panel', openDrawerPanel)
})

watch(
    () => authStore.token,
    (t) => {
        if (authStore.isLoggedIn && t) {
            connectContactsSocket(t)
        }
    },
)

watch(
    () => authStore.isLoggedIn,
    (loggedIn) => {
        if (!loggedIn) {
            disconnectContactsSocket()
        } else if (authStore.token) {
            connectContactsSocket(authStore.token)
        }
    },
)

onUnmounted(() => {
    stopGlobalPolling()
    disconnectContactsSocket()
    window.removeEventListener('open-friend-panel', openDrawerPanel)
})

</script>

<style scoped>
.friend-panel-wrapper {
    position: relative;
    z-index: 1000;
    /* 高层级保证能点到 */
}

.floating-chat-btn {
    position: fixed;
    bottom: 40px;
    right: 40px;
    z-index: 2000;
}

.shadow-btn {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s;
}

.shadow-btn:hover {
    transform: scale(1.1);
}

.panel-body {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.custom-tabs {
    padding: 0 15px;
}

.list-container {
    height: calc(100vh - 180px);
    /* 自动适配Drawer可用高度 */
    overflow-y: auto;
}

.pending-alert {
    background: #fdf6ec;
    border-radius: 4px;
    padding: 10px;
    color: #e6a23c;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    cursor: pointer;
    margin-bottom: 15px;
}

.pending-alert:hover {
    background: #faecd8;
}

.text-lines {
    white-space: pre-wrap;
    word-break: break-word;
}

.vip-inline-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed #e4e7ed;
}

.friend-item {
    display: flex;
    align-items: center;
    padding: 12px 10px;
    border-bottom: 1px solid #f0f2f5;
    cursor: pointer;
    transition: background 0.2s;
}

.friend-item:hover {
    background: #f5f7fa;
}

.friend-item .friend-info {
    margin-left: 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.friend-info .name {
    font-size: 14px;
    color: #303133;
    margin-bottom: 4px;
}

.friend-info .email {
    font-size: 12px;
    color: #909399;
}

.result-item {
    cursor: default;
}

/* Chat styles */
.chat-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 80px);
}

.chat-history {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
    background: #f5f7fa;
}

.empty-chat {
    display: flex;
    justify-content: center;
    margin-top: 30px;
}

.message-row {
    display: flex;
    margin-bottom: 15px;
}

.message-row.is-mine {
    justify-content: flex-end;
}

.message-bubble {
    max-width: 80%;
    position: relative;
}

.text-content {
    background: #ffffff;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 14px;
    color: #333;
    word-break: break-all;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.is-mine .text-content {
    background: #95ec69;
    /* 微信绿 */
}

.file-content {
    background: #ffffff;
    padding: 10px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    border: 1px solid #e4e7ed;
}

.file-content:hover {
    background: #fafafa;
}

.file-info .file-name {
    font-size: 14px;
    color: #303133;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-info .file-meta {
    font-size: 12px;
    color: #909399;
}

.msg-time {
    font-size: 11px;
    color: #c0c4cc;
    margin-top: 4px;
    text-align: left;
}

.is-mine .msg-time {
    text-align: right;
}

.chat-input-area {
    border-top: 1px solid #e4e7ed;
    background: #fff;
    padding: 10px;
}

.toolbar {
    margin-bottom: 5px;
}

.input-box :deep(.el-textarea__inner) {
    border: none;
    box-shadow: none;
    padding: 0;
}

.action-bar {
    display: flex;
    justify-content: flex-end;
    margin-top: 5px;
}
</style>
