<template>
    <el-dialog v-model="visible" :title="t('semanticSearch.title')" width="min(640px, 96vw)" destroy-on-close
        @opened="onOpened">
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
    </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import fileApiService from '@api/file'
import type { SemanticSearchItem } from '@typing/file'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'select', item: SemanticSearchItem): void
}>()

const { t } = useI18n()
const inputRef = ref<{ focus: () => void } | null>(null)
const q = ref('')
const loading = ref(false)
const searched = ref(false)
const items = ref<SemanticSearchItem[]>([])
const indexedFileCount = ref(0)

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const emptyText = computed(() => {
    if (indexedFileCount.value === 0) return t('semanticSearch.emptyNoIndex')
    return t('semanticSearch.emptyNoMatch')
})

const onOpened = async () => {
    await nextTick()
    inputRef.value?.focus?.()
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
</style>