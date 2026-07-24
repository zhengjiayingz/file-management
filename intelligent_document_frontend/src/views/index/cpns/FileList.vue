<template>
    <div class="file-list-container">
        <!-- 文件列表展示 -->
        <div v-if="files.length > 0" class="file-list" :class="viewMode" v-loading="loading">

            <!-- 列表模式表头 -->
            <div v-if="viewMode === 'list'" class="file-list-header">
                <div class="header-check" style="width: 40px; display: flex; justify-content: center;">
                    <el-checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate"
                        @change="handleSelectAll" />
                </div>
                <div class="header-item name clickable" @click="emit('sort-change', 'name')">
                    {{ t('fileList.header.name') }}
                    <el-icon v-if="sortBy === 'name'" class="sort-icon">
                        <component :is="sortOrder === 'asc' ? 'CaretTop' : 'CaretBottom'" />
                    </el-icon>
                </div>
                <div class="header-item tags">{{ t('fileList.header.tags') }}</div>
                <div class="header-item type clickable" @click="emit('sort-change', 'type')">
                    {{ t('fileList.header.type') }}
                    <el-icon v-if="sortBy === 'type'" class="sort-icon">
                        <component :is="sortOrder === 'asc' ? 'CaretTop' : 'CaretBottom'" />
                    </el-icon>
                </div>
                <div class="header-item size clickable" @click="emit('sort-change', 'size')">
                    {{ t('fileList.header.size') }}
                    <el-icon v-if="sortBy === 'size'" class="sort-icon">
                        <component :is="sortOrder === 'asc' ? 'CaretTop' : 'CaretBottom'" />
                    </el-icon>
                </div>
                <div class="header-item date clickable" @click="emit('sort-change', 'time')">
                    {{ t('fileList.header.date') }}
                    <el-icon v-if="sortBy === 'time'" class="sort-icon">
                        <component :is="sortOrder === 'asc' ? 'CaretTop' : 'CaretBottom'" />
                    </el-icon>
                </div>
                <div class="header-item actions">{{ t('fileList.header.action') }}</div>
            </div>

            <!-- 文件项 -->
            <div v-for="file in files" :key="file.id" class="file-item"
                :class="{ 'is-selected': selectedFiles?.has(file.id) }" :draggable="true"
                @click.stop="handleFileClick(file, $event)" @dblclick="handleFileDoubleClick(file)"
                @contextmenu.prevent="handleRightClick($event, file)" @dragstart="handleDragStart($event, file)"
                @drop="handleFileDrop($event, file)" @dragover="handleFileDragOver($event)"
                @mouseenter="onGridFileItemMouseEnter(file, $event)" @mouseleave="onGridFileItemMouseLeave(file, $event)">

                <div class="file-check" v-if="viewMode === 'list'"
                    style="width: 40px; display: flex; justify-content: center;">
                    <el-checkbox :model-value="selectedFiles?.has(file.id)" @click.stop
                        @change="(val) => emit('toggle-selection', file, true)" />
                </div>

                <!-- 文件图标/预览 -->
                <div class="file-icon-wrapper">
                    <div v-if="viewMode === 'list'" class="icon-box">
                        <!-- 列表模式小图标 -->
                        <img v-if="file.fileType !== 'folder' && (isImageFile(file) || isVideoFile(file)) && !imageErrorMap[file.id]"
                            :src="getFilePreviewUrl(file)" class="list-thumbnail" loading="lazy"
                            @error="handleImageError(file.id)" />
                        <FileTypeColoredIcon v-else-if="getFileTypeSymbolId(file)"
                            :name="getFileTypeSymbolId(file)!"
                            size="list" />
                        <el-icon v-else class="file-icon" :size="24" :color="getFileIconColor(file)">
                            <component :is="getFileIcon(file)" />
                        </el-icon>
                    </div>
                    <div v-else class="image-thumbnail">
                        <!-- 网格模式：视频悬停时静音循环播放前 10 秒；图片用缩略图 -->
                        <video v-if="file.fileType !== 'folder' && isVideoFile(file) && !videoErrorMap[file.id]"
                            class="file-thumbnail-img file-thumbnail-video" muted playsinline
                            :poster="getFilePreviewUrl(file)" :src="getFileVideoPreviewUrl(file)" preload="none"
                            @timeupdate="onGridVideoTimeUpdate" @ended="onGridVideoEnded"
                            @error="handleVideoError(file.id)" />
                        <img v-else-if="file.fileType !== 'folder' && (isImageFile(file) || isVideoFile(file)) && !imageErrorMap[file.id]"
                            :src="getFilePreviewUrl(file)" class="file-thumbnail-img" loading="lazy"
                            @error="handleImageError(file.id)" />
                        <FileTypeColoredIcon v-else-if="getFileTypeSymbolId(file)"
                            :name="getFileTypeSymbolId(file)!"
                            size="grid" />
                        <el-icon v-else class="file-icon" :size="64" :color="getFileIconColor(file)">
                            <component :is="getFileIcon(file)" />
                        </el-icon>
                    </div>
                </div>

                <!-- 文件信息 -->
                <div class="file-info-content">
                    <template v-if="viewMode === 'list'">
                        <div class="file-name-col">
                            <div class="file-name" :title="file.fileName">
                                {{ file.fileName }}
                            </div>
                        </div>
                        <div class="file-tags-col">
                            <div v-if="(file.tags?.length || 0) > 0" class="file-tags-row">
                                <span
                                    v-for="tg in (file.tags || []).slice(0, 6)"
                                    :key="tg.id"
                                    class="file-tag-chip"
                                    :style="tagChipStyle(tg)"
                                >{{ tg.tagName }}</span>
                                <span v-if="(file.tags?.length || 0) > 6" class="file-tag-more">+{{ (file.tags?.length || 0) - 6 }}</span>
                            </div>
                            <span v-else class="file-tags-empty">—</span>
                        </div>
                        <div class="file-type-col">{{ typeCategoryLabel(file) }}</div>
                    </template>
                    <template v-else>
                        <el-tooltip placement="top" :show-after="300"
                            popper-class="file-name-tooltip">
                            <template #content>
                                <span class="file-name-tooltip-text">{{ file.fileName }}</span>
                            </template>
                            <div class="file-name">{{ file.fileName }}</div>
                        </el-tooltip>
                    </template>

                    <template v-if="viewMode === 'list'">
                        <div class="file-size">{{ file.fileType === 'folder' ? '-' : formatFileSize(file.fileSize || 0)
                        }}
                        </div>
                        <div class="file-date">{{ formatDate(file.updatedAt) }}</div>
                        <div class="file-actions-col">
                            <el-button link type="primary" @click.stop="emit('download', file)">{{
                                t('fileList.action.download') || '下载' }}</el-button>
                            <el-button link type="primary" @click.stop="emit('rename', file)">{{
                                t('fileList.action.rename') }}</el-button>
                            <el-button link type="primary" @click.stop="emit('move', file)">{{ t('fileList.action.move')
                                }}</el-button>
                            <el-button link type="primary" @click.stop="emit('history', file)">{{
                                t('fileList.action.history') || '历史' }}</el-button>
                            <el-button link type="primary" @click.stop="emit('tag', file)">标签</el-button>
                            <el-button link type="danger" @click.stop="emit('delete', file)">{{
                                t('fileList.action.delete') }}</el-button>
                        </div>
                    </template>

                    <!-- Grid 模式下的额外信息 (悬浮显示或底部显示) -->
                    <div v-else class="grid-meta">
                        <div v-if="(file.tags?.length || 0) > 0" class="file-tags-row grid-tags">
                            <span
                                v-for="t in (file.tags || []).slice(0, 3)"
                                :key="t.id"
                                class="file-tag-chip"
                                :style="tagChipStyle(t)"
                            >{{ t.tagName }}</span>
                            <span v-if="(file.tags?.length || 0) > 3" class="file-tag-more">+{{ (file.tags?.length || 0) - 3 }}</span>
                        </div>
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
                                <el-dropdown-item command="download">{{ t('fileList.action.download') || '下载'
                                }}</el-dropdown-item>
                                <el-dropdown-item command="history">{{ t('fileList.action.history') || '历史版本'
                                }}</el-dropdown-item>
                                <el-dropdown-item command="tag">标签</el-dropdown-item>
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
import { ref, computed, watch } from 'vue'
import {
    Folder, Document, MoreFilled, VideoPlay, Picture, Headset,
    CaretTop, CaretBottom
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '@utils/fileUpload'
import { getFileTypeSymbolId } from '@utils/fileTypeIcons'
import { getFileEntryCategory } from '@utils/fileCategory'
import { isAudioMedia, isVideoMedia } from '@utils/mediaFileDetect'
import FileTypeColoredIcon from '@components/FileTypeColoredIcon/index.vue'
import type { FileItem as FileInfo, FileTagItem } from '@typing/file'
import { useAuthStore } from '@stores/auth'
import dayjs from 'dayjs'
import { buildFileThumbnailUrl } from '@utils/fileThumbnailUrl'

const { t } = useI18n()

const props = defineProps<{
    files: FileInfo[]
    viewMode: 'list' | 'grid'
    loading: boolean
    selectedFiles?: Set<number>
    sortBy?: 'name' | 'size' | 'time' | 'type'
    sortOrder?: 'asc' | 'desc'
}>()

const emit = defineEmits<{
    (e: 'click-file', file: FileInfo, event?: MouseEvent): void
    (e: 'dblclick-file', file: FileInfo): void
    (e: 'context-menu', event: MouseEvent, file: FileInfo): void
    (e: 'rename', file: FileInfo): void
    (e: 'move', file: FileInfo): void
    (e: 'download', file: FileInfo): void
    (e: 'history', file: FileInfo): void
    (e: 'tag', file: FileInfo): void
    (e: 'delete', file: FileInfo): void
    (e: 'file-drop', sourceFile: FileInfo, targetFolder: FileInfo): void
    (e: 'sort-change', column: 'name' | 'size' | 'time' | 'type'): void
    (e: 'toggle-selection', file: FileInfo, multi: boolean): void
    (e: 'select-all', checked: boolean): void
}>()

const authStore = useAuthStore()
const draggedFile = ref<FileInfo | null>(null)
const imageErrorMap = ref<Record<number, boolean>>({})
const videoErrorMap = ref<Record<number, boolean>>({})

// 列表刷新后允许重新拉取缩略图（避免曾 404 后永久占位）
watch(
    () => props.files.map((f) => f.id).join(','),
    () => {
        imageErrorMap.value = {}
        videoErrorMap.value = {}
    },
)

/** 网格内视频悬停预览：仅循环播放前 10 秒（秒），用于控制流量 */
const GRID_VIDEO_PREVIEW_SECONDS = 10

const handleImageError = (fileId: number) => {
    imageErrorMap.value[fileId] = true
}

const handleVideoError = (fileId: number) => {
    videoErrorMap.value[fileId] = true
}

const getGridCardVideo = (e: MouseEvent): HTMLVideoElement | null => {
    const card = e.currentTarget as HTMLElement | null
    if (!card) return null
    const v = card.querySelector('video.file-thumbnail-video')
    return v instanceof HTMLVideoElement ? v : null
}

/** 网格 + 视频：悬停整张卡片时播放预览 */
const onGridFileItemMouseEnter = (file: FileInfo, e: MouseEvent) => {
    if (props.viewMode !== 'grid' || file.fileType === 'folder' || !isVideoFile(file) || videoErrorMap.value[file.id]) {
        return
    }
    const video = getGridCardVideo(e)
    if (!video) return
    video.currentTime = 0
    void video.play().catch(() => {})
}

const onGridFileItemMouseLeave = (file: FileInfo, e: MouseEvent) => {
    if (props.viewMode !== 'grid' || file.fileType === 'folder' || !isVideoFile(file) || videoErrorMap.value[file.id]) {
        return
    }
    const video = getGridCardVideo(e)
    if (!video) return
    video.pause()
    video.currentTime = 0
}

const onGridVideoTimeUpdate = (e: Event) => {
    const v = e.target as HTMLVideoElement
    if (v.currentTime >= GRID_VIDEO_PREVIEW_SECONDS) {
        v.currentTime = 0
    }
}

/** 时长不足 10 秒时由 ended 循环，悬停期间保持播放 */
const onGridVideoEnded = (e: Event) => {
    const v = e.target as HTMLVideoElement
    v.currentTime = 0
    void v.play().catch(() => {})
}

// Computed for Checkbox state
const isAllSelected = computed(() => {
    return props.files.length > 0 && props.selectedFiles?.size === props.files.length
})

const isIndeterminate = computed(() => {
    const size = props.selectedFiles?.size || 0
    return size > 0 && size < props.files.length
})

const handleSelectAll = (val: string | number | boolean) => {
    emit('select-all', !!val)
}

// 辅助函数
const formatDate = (date: string) => {
    return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const isImageFile = (file: FileInfo) => {
    return (file.mimeType && file.mimeType.startsWith('image/')) ||
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.fileName)
}

const isVideoFile = (file: FileInfo) => isVideoMedia(file)

const isAudioFile = (file: FileInfo) => isAudioMedia(file)

const getFileIcon = (file: FileInfo) => {
    if (file.fileType === 'folder') return Folder
    if (isImageFile(file)) return Picture
    if (isAudioFile(file)) return Headset
    if (isVideoFile(file)) return VideoPlay
    return Document
}

const getFileIconColor = (file: FileInfo): string => {
    if (file.fileType === 'folder') return '#ffd04b'
    if (isImageFile(file)) return '#67c23a'
    if (isAudioFile(file)) return '#e6a23c'
    if (isVideoFile(file)) return '#f56c6c'
    return '#909399'
}

const getFilePreviewUrl = (file: FileInfo) => {
    return buildFileThumbnailUrl(file.id, authStore.token || '')
}

/** 网格视频预览：走下载流（inline + Range），供 video 标签播放 */
const getFileVideoPreviewUrl = (file: FileInfo) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = authStore.token || ''
    return `${API_BASE_URL}/api/files/${file.id}/download?preview=true&token=${encodeURIComponent(token)}`
}

// 事件处理
const handleFileClick = (file: FileInfo, event?: MouseEvent) => {
    // Determine if multi-select
    const multi = event ? (event.ctrlKey || event.metaKey) : false
    emit('toggle-selection', file, multi)
    emit('click-file', file, event)
}

const handleFileDoubleClick = (file: FileInfo) => {
    emit('dblclick-file', file)
}

const handleRightClick = (event: MouseEvent, file: FileInfo) => {
    // If not selected, select it (single select to avoid confusion, or just add it?)
    // Windows behavior: if right click on selection, keep selection. If right click outside, select only that one.
    if (!props.selectedFiles?.has(file.id)) {
        emit('toggle-selection', file, false)
    }
    emit('context-menu', event, file)
}

const tagChipStyle = (t: FileTagItem) => {
    const c = t.color || '#909399'
    return {
        borderColor: c,
        color: c,
        backgroundColor: `${c}1a`
    }
}

const typeCategoryLabel = (file: FileInfo) => {
    const c = getFileEntryCategory(file)
    return t(`fileList.typeCategory.${c}`)
}

const handleGridCommand = (command: string, file: FileInfo) => {
    if (command === 'rename') emit('rename', file)
    else if (command === 'move') emit('move', file)
    else if (command === 'delete') emit('delete', file)
    else if (command === 'download') emit('download', file)
    else if (command === 'history') emit('history', file)
    else if (command === 'tag') emit('tag', file)
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

            .header-check {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .header-item {
                &.clickable {
                    cursor: pointer;
                    display: flex;
                    align-items: center;

                    &:hover {
                        color: #409eff;
                    }

                    .sort-icon {
                        margin-left: 4px;
                    }
                }

                &.name {
                    flex: 1;
                }

                &.tags {
                    width: 200px;
                    flex-shrink: 0;
                }

                &.type {
                    width: 96px;
                    flex-shrink: 0;
                }

                &.size {
                    width: 100px;
                }

                &.date {
                    width: 160px;
                }

                &.actions {
                    width: 280px;
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

            .file-check {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 4px;
            }

            &:hover {
                background-color: #f5f7fa;

                @at-root html.dark & {
                    background-color: #1d1e1f; // Element dark mode hover color
                }
            }

            &.is-selected {
                background-color: #ecf5ff;

                @at-root html.dark & {
                    background-color: #2b2b2b; // Darker selection color
                }
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
                min-width: 0;

                .file-name-col {
                    flex: 1;
                    min-width: 0;
                }

                .file-name {
                    font-size: 14px;
                    color: #606266;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .file-tags-col {
                    width: 200px;
                    flex-shrink: 0;
                    align-self: center;
                    min-width: 0;
                    padding-right: 8px;
                }

                .file-type-col {
                    width: 96px;
                    flex-shrink: 0;
                    font-size: 13px;
                    color: #909399;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .file-tags-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    align-items: center;
                }

                .file-tags-empty {
                    font-size: 13px;
                    color: #c0c4cc;
                }

                .file-tag-chip {
                    font-size: 11px;
                    line-height: 1.2;
                    padding: 1px 6px;
                    border-radius: 3px;
                    border: 1px solid;
                    max-width: 92px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .file-tag-more {
                    font-size: 11px;
                    color: #909399;
                }

                .file-size {
                    width: 100px;
                    flex-shrink: 0;
                    font-size: 13px;
                    color: #909399;
                }

                .file-date {
                    width: 160px;
                    flex-shrink: 0;
                    font-size: 13px;
                    color: #909399;
                }

                .file-actions-col {
                    width: 280px;
                    flex-shrink: 0;
                    text-align: right;
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

                @at-root html.dark & {
                    background-color: #1d1e1f;
                    border-color: #4c4d4f;
                }

                .grid-actions {
                    opacity: 1;
                }
            }

            &.is-selected {
                background-color: #ecf5ff;
                border-color: #d9ecff;

                @at-root html.dark & {
                    background-color: #2b2b2b;
                    border-color: #1e4063; // Slightly blue-ish border for selection
                }
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

                    .file-thumbnail-video {
                        pointer-events: none;
                        background: #000;
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
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    width: 100%;
                }

                .grid-tags {
                    justify-content: center;
                }

                .file-tags-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 3px;
                    justify-content: center;
                }

                .file-tag-chip {
                    font-size: 10px;
                    line-height: 1.2;
                    padding: 1px 5px;
                    border-radius: 3px;
                    border: 1px solid;
                    max-width: 72px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .file-tag-more {
                    font-size: 10px;
                    color: #909399;
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

<!-- el-tooltip 的 popper 挂在 body，需单独写样式 -->
<style lang="scss">
.file-name-tooltip {
    max-width: min(90vw, 360px);

    .file-name-tooltip-text {
        display: inline-block;
        word-break: break-all;
        line-height: 1.5;
    }
}
</style>
