<template>
    <div class="file-list-container">
        <!-- 文件列表展示 -->
        <div v-if="files.length > 0" class="file-list" :class="viewMode" v-loading="loading">

            <!-- 列表模式表头 -->
            <div v-if="viewMode === 'list'" class="file-list-header">
                <div class="header-item name">{{ t('fileList.header.name') }}</div>
                <div class="header-item size">{{ t('fileList.header.size') }}</div>
                <div class="header-item date">{{ t('fileList.header.date') }}</div>
                <div class="header-item actions">{{ t('fileList.header.action') }}</div>
            </div>

            <!-- 文件项 -->
            <div v-for="file in files" :key="file.id" class="file-item"
                :class="{ 'is-selected': selectedFile?.id === file.id }" :draggable="true"
                @click.stop="handleFileClick(file)" @dblclick="handleFileDoubleClick(file)"
                @contextmenu.prevent="handleRightClick($event, file)" @dragstart="handleDragStart($event, file)"
                @drop="handleFileDrop($event, file)" @dragover="handleFileDragOver($event)">

                <!-- 文件图标/预览 -->
                <div class="file-icon-wrapper">
                    <div v-if="viewMode === 'list'" class="icon-box">
                        <!-- 列表模式小图标 -->
                        <img v-if="file.fileType !== 'folder' && (isImageFile(file) || isVideoFile(file)) && !imageErrorMap[file.id]"
                            :src="getFilePreviewUrl(file)" class="list-thumbnail" loading="lazy"
                            @error="handleImageError(file.id)" />
                        <el-icon v-else class="file-icon" :size="24" :color="getFileIconColor(file)">
                            <component :is="getFileIcon(file)" />
                        </el-icon>
                    </div>
                    <div v-else class="image-thumbnail">
                        <!-- 网格模式大图标 或 图片缩略图 -->
                        <img v-if="file.fileType !== 'folder' && (isImageFile(file) || isVideoFile(file)) && !imageErrorMap[file.id]"
                            :src="getFilePreviewUrl(file)" class="file-thumbnail-img" loading="lazy"
                            @error="handleImageError(file.id)" />
                        <el-icon v-else class="file-icon" :size="64" :color="getFileIconColor(file)">
                            <component :is="getFileIcon(file)" />
                        </el-icon>
                    </div>
                </div>

                <!-- 文件信息 -->
                <div class="file-info-content">
                    <div class="file-name" :title="file.fileName">
                        {{ file.fileName }}
                    </div>

                    <div v-if="viewMode === 'list'" class="file-meta-row">
                        <div class="file-size">{{ file.fileType === 'folder' ? '-' : formatFileSize(file.fileSize) }}
                        </div>
                        <div class="file-date">{{ formatDate(file.updatedAt) }}</div>
                        <div class="file-actions-col">
                            <el-button link type="primary" @click.stop="emit('rename', file)">{{
                                t('fileList.action.rename') }}</el-button>
                            <el-button link type="primary" @click.stop="emit('move', file)">{{ t('fileList.action.move')
                            }}</el-button>
                            <el-button link type="danger" @click.stop="emit('delete', file)">{{
                                t('fileList.action.delete') }}</el-button>
                        </div>
                    </div>

                    <!-- Grid 模式下的额外信息 (悬浮显示或底部显示) -->
                    <div v-else class="grid-meta">
                        <span class="grid-date">{{ formatDate(file.updatedAt) }}</span>
                    </div>
                </div>

                <!-- Grid 模式下的悬浮操作栏 -->
                <div v-if="viewMode === 'grid'" class="grid-actions">
                    <el-dropdown trigger="click" @command="(cmd: string) => handleGridCommand(cmd, file)">
                        <el-icon class="more-btn">
                            <MoreFilled />
                        </el-icon>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item command="rename">{{ t('fileList.action.rename') }}</el-dropdown-item>
                                <el-dropdown-item command="move">{{ t('fileList.action.move') }}</el-dropdown-item>
                                <el-dropdown-item command="delete" style="color: red">{{ t('fileList.action.delete')
                                }}</el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                </div>

            </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!loading" class="empty-state">
            <el-icon class="empty-icon" size="64">
                <Folder />
            </el-icon>
            <p class="empty-text">{{ t('index.empty') }}</p>
            <p class="empty-hint">{{ t('index.emptyHint') }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
    Folder, Document, MoreFilled, VideoPlay, Picture, Headset
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../../../utils/fileUpload'
import type { FileInfo } from '../../../api/file'
import { useAuthStore } from '../../../stores/auth'
import dayjs from 'dayjs'

const { t } = useI18n()

const props = defineProps<{
    files: FileInfo[]
    viewMode: 'list' | 'grid'
    loading: boolean
}>()

const emit = defineEmits<{
    (e: 'click-file', file: FileInfo): void
    (e: 'dblclick-file', file: FileInfo): void
    (e: 'context-menu', event: MouseEvent, file: FileInfo): void
    (e: 'rename', file: FileInfo): void
    (e: 'move', file: FileInfo): void
    (e: 'delete', file: FileInfo): void
    (e: 'file-drop', sourceFile: FileInfo, targetFolder: FileInfo): void
}>()

const authStore = useAuthStore()
const selectedFile = ref<FileInfo | null>(null)
const draggedFile = ref<FileInfo | null>(null)
const imageErrorMap = ref<Record<number, boolean>>({})

const handleImageError = (fileId: number) => {
    imageErrorMap.value[fileId] = true
}

// 辅助函数
const formatDate = (date: string) => {
    return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const isImageFile = (file: FileInfo) => {
    return file.mimeType.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.fileName)
}

const isVideoFile = (file: FileInfo) => {
    return file.mimeType.startsWith('video/') ||
        /\.(mp4|webm|ogg|mov|wmv|flv|avi|rmvb|mkv)$/i.test(file.fileName)
}

const isAudioFile = (file: FileInfo) => {
    return file.mimeType.startsWith('audio/') ||
        /\.(mp3|wav|ogg|flac|aac)$/i.test(file.fileName)
}

const getFileIcon = (file: FileInfo) => {
    if (file.fileType === 'folder') return Folder
    if (isImageFile(file)) return Picture
    if (isVideoFile(file)) return VideoPlay
    if (isAudioFile(file)) return Headset
    return Document
}

const getFileIconColor = (file: FileInfo): string => {
    if (file.fileType === 'folder') return '#ffd04b'
    if (isImageFile(file)) return '#67c23a'
    if (isVideoFile(file)) return '#f56c6c'
    if (isAudioFile(file)) return '#e6a23c'
    return '#909399'
}

const getFilePreviewUrl = (file: FileInfo) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = authStore.token || ''
    return `${API_BASE_URL}/api/files/${file.id}/thumbnail?token=${token}`
}

// 事件处理
const handleFileClick = (file: FileInfo) => {
    selectedFile.value = file
    emit('click-file', file)
}

const handleFileDoubleClick = (file: FileInfo) => {
    emit('dblclick-file', file)
}

const handleRightClick = (event: MouseEvent, file: FileInfo) => {
    selectedFile.value = file
    emit('context-menu', event, file)
}

const handleGridCommand = (command: string, file: FileInfo) => {
    if (command === 'rename') emit('rename', file)
    else if (command === 'move') emit('move', file)
    else if (command === 'delete') emit('delete', file)
}

// 拖拽逻辑
const handleDragStart = (event: DragEvent, file: FileInfo) => {
    draggedFile.value = file
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        // 设个图标或者内容？
    }
}

const handleFileDragOver = (event: DragEvent) => {
    event.preventDefault() // Allow drop
}

const handleFileDrop = (event: DragEvent, targetFile: FileInfo) => {
    event.preventDefault()
    if (draggedFile.value && targetFile.fileType === 'folder' && draggedFile.value.id !== targetFile.id) {
        emit('file-drop', draggedFile.value, targetFile)
    }
    draggedFile.value = null
}
</script>

<style lang="scss" scoped>
.file-list {
    &.list {
        .file-list-header {
            display: flex;
            padding: 0 10px;
            border-bottom: 1px solid #ebeef5;
            color: #909399;
            font-size: 13px;
            line-height: 40px;

            .header-item {
                &.name {
                    flex: 1;
                }

                &.size {
                    width: 100px;
                }

                &.date {
                    width: 160px;
                }

                &.actions {
                    width: 150px;
                    text-align: right;
                }
            }
        }

        .file-item {
            display: flex;
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: background-color 0.2s;

            &:hover {
                background-color: #f5f7fa;
            }

            &.is-selected {
                background-color: #ecf5ff;
            }

            .file-icon-wrapper {
                margin-right: 12px;
                width: 32px;

                .icon-box {
                    display: flex;
                    justify-content: center;

                    .list-thumbnail {
                        width: 32px;
                        height: 32px;
                        object-fit: cover;
                        border-radius: 4px;
                    }
                }
            }

            .file-info-content {
                flex: 1;
                display: flex;
                align-items: center;

                .file-name {
                    flex: 1;
                    font-size: 14px;
                    color: #606266;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .file-meta-row {
                    display: flex;
                    align-items: center;

                    .file-size {
                        width: 100px;
                        font-size: 13px;
                        color: #909399;
                    }

                    .file-date {
                        width: 160px;
                        font-size: 13px;
                        color: #909399;
                    }

                    .file-actions-col {
                        width: 150px;
                        text-align: right;
                    }
                }
            }
        }
    }

    &.grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 20px;
        padding: 10px;

        .file-item {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 15px;
            border: 1px solid transparent;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
                background-color: #f5f7fa;
                border-color: #ebeef5;

                .grid-actions {
                    opacity: 1;
                }
            }

            &.is-selected {
                background-color: #ecf5ff;
                border-color: #d9ecff;
            }

            .file-icon-wrapper {
                margin-bottom: 10px;

                .image-thumbnail {
                    width: 80px;
                    height: 80px;
                    display: flex;
                    align-items: center;
                    justify-content: center;

                    .file-thumbnail-img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        border-radius: 6px;
                    }
                }
            }

            .file-info-content {
                width: 100%;
                text-align: center;

                .file-name {
                    font-size: 13px;
                    color: #303133;
                    margin-bottom: 4px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .grid-meta {
                    font-size: 12px;
                    color: #c0c4cc;
                    transform: scale(0.9);
                }
            }

            .grid-actions {
                position: absolute;
                top: 5px;
                right: 5px;
                opacity: 0;
                transition: opacity 0.2s;

                .more-btn {
                    transform: rotate(90deg);
                    cursor: pointer;
                    color: #909399;
                }
            }
        }
    }
}

.empty-state {
    text-align: center;
    padding: 60px 0;

    .empty-icon {
        color: #dcdfe6;
        margin-bottom: 10px;
    }

    .empty-text {
        color: #909399;
    }

    .empty-hint {
        font-size: 12px;
        color: #c0c4cc;
        margin-top: 5px;
    }
}
</style>
