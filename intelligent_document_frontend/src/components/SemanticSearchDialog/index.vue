<template>
    <el-dialog v-model="visible" :title="t('semanticSearch.title')" width="min(720px, 96vw)" destroy-on-close
        append-to-body @opened="onOpened" @closed="onClosed">
        <el-tabs v-model="activeTab" class="search-tabs">
            <el-tab-pane :label="t('semanticSearch.tabText')" name="text">
                <div class="semantic-search">
                    <div class="search-row">
                        <el-input ref="inputRef" v-model="q" clearable :placeholder="t('semanticSearch.placeholder')"
                            @keyup.enter="runSearch" />
                        <el-button type="primary" :loading="loading" @click="runSearch">
                            {{ t('semanticSearch.search') }}
                        </el-button>
                    </div>

                    <div v-loading="loading" class="result-area">
                        <el-empty v-if="searched && !loading && items.length === 0" :description="emptyText" />
                        <ul v-else-if="items.length" class="result-list">
                            <li v-for="item in items" :key="item.id" class="result-item" @click="emit('select', item)">
                                <div class="result-title">
                                    <span class="name">{{ item.fileName }}</span>
                                    <span class="score">{{ item.score }}</span>
                                </div>
                                <p class="excerpt">{{ item.excerpt }}</p>
                            </li>
                        </ul>
                    </div>
                </div>
            </el-tab-pane>

            <el-tab-pane :label="t('semanticSearch.tabImage')" name="image">
                <div class="semantic-search">
                    <p class="image-hint">{{ t('semanticSearch.imageHint') }}</p>
                    <div class="search-row image-row">
                        <!-- 对话框内 el-upload 常被 focus trap 挡住；改用原生 input 触发选文件 -->
                        <input
                            ref="imageInputRef"
                            type="file"
                            accept="image/*"
                            class="image-file-input"
                            @change="onQueryImageInput"
                        />
                        <el-button @click="pickQueryImage">{{ t('semanticSearch.imagePick') }}</el-button>
                        <span v-if="queryFileName" class="query-name">{{ queryFileName }}</span>
                        <el-button type="primary" :loading="imageLoading" :disabled="!queryFile"
                            @click="runImageSearch">
                            {{ t('semanticSearch.search') }}
                        </el-button>
                    </div>
                    <div v-if="queryPreviewUrl" class="query-preview">
                        <img :src="queryPreviewUrl" alt="query" />
                    </div>

                    <div v-loading="imageLoading" :element-loading-text="t('semanticSearch.imageSearching')"
                        class="result-area">
                        <el-empty v-if="imageSearched && !imageLoading && imageItems.length === 0"
                            :description="imageEmptyText" />
                        <div v-else-if="imageItems.length" class="image-grid">
                            <button v-for="item in imageItems" :key="item.id" type="button" class="image-card"
                                @click="onSelectImage(item)">
                                <img :src="thumbUrl(item.id)" :alt="item.fileName" loading="lazy" />
                                <div class="image-meta">
                                    <span class="name">{{ item.fileName }}</span>
                                    <span class="score">{{ item.score }}</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </el-tab-pane>
        </el-tabs>
    </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import fileApiService from '@api/file'
import { useAuthStore } from '@stores/auth'
import type { ImageSearchItem, SemanticSearchItem } from '@typing/file'
import { buildFileThumbnailUrl } from '@utils/fileThumbnailUrl'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'select', item: SemanticSearchItem | ImageSearchItem): void
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const inputRef = ref<{ focus: () => void } | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const activeTab = ref<'text' | 'image'>('text')
const q = ref('')
const loading = ref(false)
const searched = ref(false)
const items = ref<SemanticSearchItem[]>([])
const indexedFileCount = ref(0)

const queryFile = ref<File | null>(null)
const queryFileName = ref('')
const queryPreviewUrl = ref('')
const imageLoading = ref(false)
const imageSearched = ref(false)
const imageItems = ref<ImageSearchItem[]>([])
const galleryCount = ref(0)

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const emptyText = computed(() => {
    if (indexedFileCount.value === 0) return t('semanticSearch.emptyNoIndex')
    return t('semanticSearch.emptyNoMatch')
})

const imageEmptyText = computed(() => {
    if (galleryCount.value === 0) return t('semanticSearch.imageEmptyGallery')
    return t('semanticSearch.imageEmptyNoMatch')
})

const thumbUrl = (id: number) => {
    return buildFileThumbnailUrl(id, authStore.token || '')
}
/** 清除图片预览 URL */
const clearQueryPreview = () => {
    if (queryPreviewUrl.value) {
        URL.revokeObjectURL(queryPreviewUrl.value)
        queryPreviewUrl.value = ''
    }
}

const onOpened = async () => {
    await nextTick()
    if (activeTab.value === 'text') inputRef.value?.focus?.()
}

const onClosed = () => {
    clearQueryPreview()
    queryFile.value = null
    queryFileName.value = ''
    if (imageInputRef.value) imageInputRef.value.value = ''
}

const pickQueryImage = () => {
    imageInputRef.value?.click()
}

const onQueryImageInput = (ev: Event) => {
    const input = ev.target as HTMLInputElement
    const raw = input.files?.[0]
    if (!raw) return
    clearQueryPreview()
    queryFile.value = raw // 真正的 File，点「搜索」时才发给后端
    queryFileName.value = raw.name // 文件名，显示在按钮旁边
    //! 创建图片预览 URL
    queryPreviewUrl.value = URL.createObjectURL(raw)
    imageSearched.value = false // 搜索结果重置
    imageItems.value = []
}

const runSearch = async () => {
    const text = q.value.trim()
    if (!text) {
        ElMessage.warning(t('semanticSearch.needQuery'))
        return
    }
    loading.value = true
    searched.value = true
    try {
        const data = await fileApiService.searchFilesSemantic({ q: text })
        items.value = data?.items ?? []
        indexedFileCount.value = data?.indexedFileCount ?? 0
    } catch {
        items.value = []
        indexedFileCount.value = 0
    } finally {
        loading.value = false
    }
}

// 点击「搜索」按钮
const runImageSearch = async () => {
    if (!queryFile.value) {
        ElMessage.warning(t('semanticSearch.imageNeedFile'))
        return
    }
    imageLoading.value = true
    imageSearched.value = true
    try {
        // 把整个图片传到后端
        const data = await fileApiService.searchFilesByImage(queryFile.value)
        imageItems.value = data?.items ?? [] // 搜索结果填充到图片网格
        galleryCount.value = data?.galleryCount ?? 0 // 后端最多拉 100 张网盘图参与比对，galleryCount 是实际参与的数量
    } catch {
        imageItems.value = []
        galleryCount.value = 0
    } finally {
        imageLoading.value = false
    }
}

const onSelectImage = (item: ImageSearchItem) => {
    emit('select', {
        ...item,
        excerpt: '',
        chunkIndex: 0,
    })
}
</script>

<style scoped>
.semantic-search {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 280px;
}

.search-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.image-row {
    flex-wrap: wrap;
}

.image-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
}

.image-hint {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.query-name {
    font-size: 13px;
    color: var(--el-text-color-regular);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.query-preview {
    width: 120px;
    height: 120px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--el-fill-color-light);
}

.query-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.result-area {
    min-height: 200px;
}

.result-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.result-item {
    padding: 10px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    cursor: pointer;
}

.result-item:hover {
    background: var(--el-fill-color-light);
}

.result-title {
    display: flex;
    justify-content: space-between;
    gap: 8px;
}

.name {
    font-weight: 600;
}

.score {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}

.excerpt {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--el-text-color-regular);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
}

.image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
}

.image-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    overflow: hidden;
    background: var(--el-bg-color);
    cursor: pointer;
    text-align: left;
}

.image-card:hover {
    border-color: var(--el-color-primary-light-5);
}

.image-card img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    background: var(--el-fill-color-light);
}

.image-meta {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 0 8px 8px;
    font-size: 12px;
}

.image-meta .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
}
</style>
