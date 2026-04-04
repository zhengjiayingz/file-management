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
        <el-drawer v-model="drawerVisible" :title="currentChatFriend ? `与 ${currentChatFriend.username} 聊天` : '好友与消息'"
            size="380px" :with-header="true" @close="handleDrawerClose">
            <!-- 为了自定义Header返回按钮 -->
            <template #header="{ close, titleId, titleClass }">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <el-button v-if="currentChatFriend" icon="ArrowLeft" circle size="small"
                            @click="currentChatFriend = null; loadData(); stopPollingChat()" />
                        <h4 :id="titleId" :class="titleClass" style="margin: 0; color: #303133;">
                            {{ currentChatFriend ? currentChatFriend.username : '好友与消息' }}
                        </h4>
                    </div>
                </div>
            </template>

            <!-- 主视图 (非聊天界面) -->
            <div v-if="!currentChatFriend" class="panel-body">
                <el-tabs v-model="activeTab" class="custom-tabs">
                    <el-tab-pane label="好友" name="friends">
                        <!-- 待处理请求提示 -->
                        <div v-if="pendingRequests.length > 0" class="pending-alert" @click="activeTab = 'requests'">
                            <el-icon color="#E6A23C">
                                <Bell />
                            </el-icon>
                            <span>您有 {{ pendingRequests.length }} 个待处理的好友请求</span>
                            <el-icon>
                                <ArrowRight />
                            </el-icon>
                        </div>

                        <div class="list-container">
                            <el-empty v-if="friends.length === 0" description="暂无好友" :image-size="60" />
                            <div v-for="friend in friends" :key="friend.friendId" class="friend-item"
                                @click="openChat(friend)">
                                <el-avatar :size="40" style="background:#409EFF; font-weight: bold;">
                                    {{ friend.username.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ friend.username }}</span>
                                    <span class="email">{{ friend.email || '未绑定邮箱' }}</span>
                                </div>
                                <el-badge :value="getUnreadCount(friend.friendId)"
                                    :hidden="getUnreadCount(friend.friendId) === 0" />
                            </div>
                        </div>
                    </el-tab-pane>

                    <el-tab-pane label="添加" name="add">
                        <div class="search-box" style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <el-input v-model="searchKeyword" placeholder="输入用户名或ID搜索" clearable
                                @keyup.enter="handleSearchUser" />
                            <el-button type="primary" @click="handleSearchUser" :loading="searching">
                                搜索
                            </el-button>
                        </div>
                        <div class="list-container" v-loading="searching">
                            <el-empty v-if="searchResults.length === 0 && searchPushed" description="未找到匹配的用户"
                                :image-size="60" />
                            <div v-for="user in searchResults" :key="user.id" class="friend-item result-item">
                                <el-avatar :size="40" style="background:#67C23A">
                                    {{ user.username.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ user.username }} (ID: {{ user.id }})</span>
                                </div>
                                <el-button size="small" type="primary" plain
                                    @click="sendFriendRequest(user)">添加</el-button>
                            </div>
                        </div>
                    </el-tab-pane>

                    <el-tab-pane :label="`请求 (${pendingRequests.length})`" name="requests">
                        <div class="list-container">
                            <el-empty v-if="pendingRequests.length === 0" description="暂无请求" :image-size="60" />
                            <div v-for="req in pendingRequests" :key="req.requestId" class="friend-item result-item">
                                <el-avatar :size="40" style="background:#E6A23C">
                                    {{ req.senderUsername.charAt(0).toUpperCase() }}
                                </el-avatar>
                                <div class="friend-info">
                                    <span class="name">{{ req.senderUsername }}</span>
                                    <span class="email">请求加为好友</span>
                                </div>
                                <div class="action-btns" style="display: flex; gap: 8px;">
                                    <el-button size="small" type="success"
                                        @click="handleRequest(req.requestId, true)">同意</el-button>
                                    <el-button size="small" type="danger" plain
                                        @click="handleRequest(req.requestId, false)">拒绝</el-button>
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
                        <span style="color:#909399; font-size:13px;">暂无聊天记录，打个招呼吧</span>
                    </div>
                    <div v-for="msg in chatMessages" :key="msg.id" class="message-row"
                        :class="{ 'is-mine': msg.senderId === myUserId }">
                        <div class="message-bubble">
                            <!-- 文本消息 -->
                            <div v-if="msg.messageType === 'text'" class="text-content">
                                {{ msg.content }}
                            </div>
                            <!-- 文件消息 -->
                            <div v-else-if="msg.messageType === 'file' && msg.file" class="file-content"
                                @click="openSaveFilePicker(msg.file)">
                                <el-icon size="24" color="#409eff">
                                    <Document />
                                </el-icon>
                                <div class="file-info">
                                    <div class="file-name">{{ msg.file.fileName }}</div>
                                    <div class="file-meta">保存到网盘</div>
                                </div>
                            </div>
                            <!-- 异常文件类型处理 -->
                            <div v-else class="text-content">
                                [不支持的消息或文件已被删除] : {{ msg.content }}
                            </div>
                            <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
                        </div>
                    </div>
                </div>

                <div class="chat-input-area">
                    <div class="toolbar">
                        <el-button link type="primary" icon="FolderOpened" @click="openFilePicker">分享文件</el-button>
                    </div>
                    <div class="input-box">
                        <el-input v-model="messageText" type="textarea" :rows="3" resize="none"
                            placeholder="输入消息，回车发送..." @keydown.enter.prevent="handleSendMessage" />
                    </div>
                    <div class="action-bar">
                        <el-button type="primary" size="small" @click="handleSendMessage">发送</el-button>
                    </div>
                </div>
            </div>
        </el-drawer>

        <!-- 分享文件选择器弹窗 -->
        <el-dialog v-model="filePickerVisible" title="选择文件分享" width="600px" destroy-on-close>
            <div class="file-picker-container" v-loading="loadingFiles">
                <!-- 简单文件列表层级导航 -->
                <el-breadcrumb separator="/" style="margin-bottom:15px;">
                    <el-breadcrumb-item @click="pickFolder()" style="cursor: pointer;">根目录</el-breadcrumb-item>
                    <el-breadcrumb-item v-for="f in pickBreadcrumbs" :key="f.id" @click="pickFolder(f.id)"
                        style="cursor: pointer;">
                        {{ f.name }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <el-table :data="pickFiles" height="300" style="width: 100%" @row-click="handlePickFileRow">
                    <el-table-column label="名称">
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
                                @click.stop="confirmShareFile(row)">分享</el-button>
                            <el-button v-else type="info" link
                                @click.stop="pickFolder(row.id, row.fileName)">进入</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
        </el-dialog>

        <!-- 保存文件选择器弹窗 -->
        <el-dialog v-model="savePickerVisible" title="选择要保存到的目标文件夹" width="600px" destroy-on-close>
            <div class="file-picker-container" v-loading="loadingFiles">
                <!-- 简单文件列表层级导航 -->
                <el-breadcrumb separator="/" style="margin-bottom:15px;">
                    <el-breadcrumb-item @click="pickFolder()" style="cursor: pointer;">根目录</el-breadcrumb-item>
                    <el-breadcrumb-item v-for="f in pickBreadcrumbs" :key="f.id" @click="pickFolder(f.id)"
                        style="cursor: pointer;">
                        {{ f.name }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <el-table :data="onlyFolders" height="300" style="width: 100%" @row-click="handlePickFileRow">
                    <el-table-column label="名称">
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
                            <el-button type="info" link @click.stop="pickFolder(row.id, row.fileName)">进入</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="savePickerVisible = false">取消</el-button>
                    <el-button type="primary" @click="confirmSaveFileHere" :loading="savingFile">
                        保存到当前文件夹
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
import fileApiService from '@api/file'
import type { FileItem } from '@typing/file'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()
const myUserId = computed(() => authStore.user?.id)

// 面板状态
const drawerVisible = ref(false)
const activeTab = ref('friends')

// 数据
const friends = ref<any[]>([])
const pendingRequests = ref<any[]>([])
const unreadSummary = ref<any[]>([])

// 搜索
const searchKeyword = ref('')
const searching = ref(false)
const searchResults = ref<any[]>([])
const searchPushed = ref(false)

// 聊天
const currentChatFriend = ref<any>(null)
const chatMessages = ref<any[]>([])
const messageText = ref('')
const chatHistoryRef = ref<HTMLElement | null>(null)
let chatPollTimer: any = null
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

const handleDrawerClose = () => {
    stopPollingChat()
}

// 轮询基础数据(全量请求/未读数) - 建议10秒一次
const startGlobalPolling = () => {
    if (summaryPollTimer) clearInterval(summaryPollTimer)
    summaryPollTimer = setInterval(() => {
        if (authStore.isLoggedIn) {
            fetchUnreadSummary()
            fetchPendingRequests()
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
        ElMessage.error('搜索失败')
    } finally {
        searching.value = false
    }
}

const sendFriendRequest = async (user: any) => {
    try {
        await friendshipApi.sendRequest({ friendId: user.id })
        ElMessage.success('请求发送成功')
        // 将该用户从搜索结果中移除
        searchResults.value = searchResults.value.filter(u => u.id !== user.id)
    } catch (error: any) {
        ElMessage.error(error.response?.data?.message || '发送失败')
    }
}

const handleRequest = async (requestId: number, accept: boolean) => {
    try {
        if (accept) {
            await friendshipApi.acceptRequest(requestId)
            ElMessage.success('已添加好友')
        } else {
            await friendshipApi.rejectRequest(requestId)
            ElMessage.success('已拒绝')
        }
        await fetchPendingRequests()
        await fetchFriends()
    } catch (error: any) {
        ElMessage.error(error.response?.data?.message || '操作失败')
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
    startPollingChat()
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

// 聊天内每2秒轮询一次（简化版WebSocket）
const startPollingChat = () => {
    if (chatPollTimer) clearInterval(chatPollTimer)
    chatPollTimer = setInterval(() => {
        if (currentChatFriend.value) {
            loadChatHistory(false)
            // 在这里如果是打开状态，可以静默调一次markAsRead (防多端)
        }
    }, 2000)
}

const stopPollingChat = () => {
    if (chatPollTimer) clearInterval(chatPollTimer)
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
        ElMessage.error('发送留言失败')
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
        ElMessage.error('获取文件失败')
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
        ElMessage.success('文件分享成功')
        filePickerVisible.value = false
        loadChatHistory(true)
    } catch (e: any) {
        ElMessage.error('分享失败')
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
        ElMessage.success('成功存入网盘')
        savePickerVisible.value = false
    } catch (e: any) {
        ElMessage.error(e.response?.data?.message || '保存失败')
    } finally {
        savingFile.value = false
    }
}

onMounted(() => {
    startGlobalPolling()
    window.addEventListener('open-friend-panel', openDrawerPanel)
})
onUnmounted(() => {
    stopGlobalPolling()
    stopPollingChat()
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
