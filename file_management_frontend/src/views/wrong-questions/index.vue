<template>
  <div class="wrong-book-page">
    <Sidebar />
    <el-container class="main-container">
      <GlobalHeader>
        <template #left>
          <h3>{{ t('wrongBook.title') }}</h3>
        </template>
      </GlobalHeader>

      <el-main v-loading="loading">
        <div class="filter-bar">
          <span class="filter-label">{{ t('wrongBook.filterByTag') }}</span>
          <el-select
            v-model="filterTag"
            clearable
            filterable
            allow-create
            default-first-option
            :placeholder="t('wrongBook.filterTagPlaceholder')"
            class="filter-select"
          >
            <el-option
              v-for="tag in tagOptions"
              :key="tag"
              :label="tag"
              :value="tag"
            />
          </el-select>

          <span class="filter-label">{{ t('wrongBook.filterByDifficulty') }}</span>
          <el-select
            v-model="filterDifficulty"
            clearable
            :placeholder="t('wrongBook.filterDifficultyPlaceholder')"
            class="filter-select filter-select--sm"
          >
            <el-option
              v-for="d in WRONG_QUESTION_DIFFICULTIES"
              :key="d"
              :label="t(`wrongBook.difficulty.${d}`)"
              :value="d"
            />
          </el-select>

          <span class="filter-label">{{ t('wrongBook.filterByTime') }}</span>
          <el-date-picker
            v-model="filterDateRange"
            type="daterange"
            unlink-panels
            value-format="YYYY-MM-DD"
            range-separator="—"
            :start-placeholder="t('wrongBook.filterTimeFrom')"
            :end-placeholder="t('wrongBook.filterTimeTo')"
            class="filter-date"
          />

          <el-button type="primary" @click="onQuery">
            {{ t('wrongBook.filterQuery') }}
          </el-button>
          <el-button @click="onReset">
            {{ t('wrongBook.filterReset') }}
          </el-button>
        </div>

        <el-empty
          v-if="!loading && items.length === 0"
          :description="hasAppliedFilter ? t('wrongBook.emptyFiltered') : t('wrongBook.empty')"
        />
        <el-table v-else :data="items" border stripe style="width: 100%">
          <el-table-column prop="id" label="ID" width="72" align="center" />
          <el-table-column :label="t('wrongBook.colQuestion')" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              {{ truncate(row.questionText, 80) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('wrongBook.colDifficulty')" width="100" align="center">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="difficultyTagType(row.difficulty)"
                style="cursor: pointer"
                @click="fillDifficulty(row.difficulty)"
              >
                {{ t(`wrongBook.difficulty.${row.difficulty}`) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('wrongBook.colTags')" min-width="140">
            <template #default="{ row }">
              <el-tag
                v-for="tag in row.tags"
                :key="tag"
                size="small"
                class="tag-chip"
                :effect="appliedTag === tag ? 'dark' : 'light'"
                style="cursor: pointer"
                @click="fillTag(tag)"
              >
                {{ tag }}
              </el-tag>
              <span v-if="!row.tags?.length" class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('wrongBook.colFile')" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.fileName || t('wrongBook.noImage') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('wrongBook.colTime')" width="180" align="center">
            <template #default="{ row }">
              {{ formatTime(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('wrongBook.colActions')" width="160" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/wrong-questions/${row.id}`)">
                {{ t('wrongBook.open') }}
              </el-button>
              <el-button link type="danger" @click="onDelete(row)">
                {{ t('wrongBook.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import Sidebar from '@/views/index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import {
  WRONG_QUESTION_DIFFICULTIES,
  deleteWrongQuestion,
  listWrongQuestions,
  type WrongQuestionDifficulty,
  type WrongQuestionItem,
} from '@api/wrong-questions'

const { t } = useI18n()
const router = useRouter()
const loading = ref(false)
const items = ref<WrongQuestionItem[]>([])
/** 考点下拉选项（来自未筛选全量列表） */
const tagOptions = ref<string[]>([])
/** 表单草稿条件（改动后需点「查询」才生效） */
const filterTag = ref('')
const filterDifficulty = ref<WrongQuestionDifficulty | ''>('')
const filterDateRange = ref<[string, string] | null>(null)
/** 已生效的查询条件 */
const appliedTag = ref('')
const appliedDifficulty = ref<WrongQuestionDifficulty | ''>('')
const appliedDateRange = ref<[string, string] | null>(null)

const hasAppliedFilter = computed(
  () =>
    Boolean(appliedTag.value) ||
    Boolean(appliedDifficulty.value) ||
    Boolean(appliedDateRange.value?.length === 2),
)

function truncate(s: string, n: number) {
  const t0 = s.replace(/\s+/g, ' ').trim()
  return t0.length <= n ? t0 : `${t0.slice(0, n)}…`
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function difficultyTagType(
  d: WrongQuestionDifficulty,
): 'success' | 'warning' | 'danger' {
  if (d === 'easy') return 'success'
  if (d === 'hard') return 'danger'
  return 'warning'
}

function collectTags(rows: WrongQuestionItem[]): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    for (const tag of row.tags || []) {
      const t0 = tag.trim()
      if (t0) set.add(t0)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

async function refreshTagOptions() {
  try {
    const res = await listWrongQuestions({ page: 1, pageSize: 100 })
    tagOptions.value = collectTags(res.items)
  } catch {
    /* 选项刷新失败不影响主列表 */
  }
}

async function load() {
  loading.value = true
  try {
    const tag = appliedTag.value.trim() || undefined
    const difficulty = appliedDifficulty.value || undefined
    const createdFrom = appliedDateRange.value?.[0] || undefined
    const createdTo = appliedDateRange.value?.[1] || undefined
    const res = await listWrongQuestions({
      page: 1,
      pageSize: 50,
      tag,
      difficulty,
      createdFrom,
      createdTo,
    })
    items.value = res.items
  } catch (e) {
    ElMessage.error((e instanceof Error ? e.message : '') || t('wrongBook.loadError'))
  } finally {
    loading.value = false
  }
}

/** 用当前表单条件查询 */
function onQuery() {
  appliedTag.value = filterTag.value.trim()
  appliedDifficulty.value = filterDifficulty.value
  appliedDateRange.value = filterDateRange.value
    ? [filterDateRange.value[0], filterDateRange.value[1]]
    : null
  void load()
}

/** 清空条件并立即无条件查询 */
function onReset() {
  filterTag.value = ''
  filterDifficulty.value = ''
  filterDateRange.value = null
  appliedTag.value = ''
  appliedDifficulty.value = ''
  appliedDateRange.value = null
  void load()
}

/** 点击表格标签仅填入表单，需再点查询 */
function fillTag(tag: string) {
  filterTag.value = tag
}

function fillDifficulty(d: WrongQuestionDifficulty) {
  filterDifficulty.value = d
}

async function onDelete(row: WrongQuestionItem) {
  try {
    await ElMessageBox.confirm(t('wrongBook.deleteConfirm'), t('wrongBook.delete'), {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteWrongQuestion(row.id)
    ElMessage.success(t('wrongBook.deleteSuccess'))
    await Promise.all([load(), refreshTagOptions()])
  } catch (e) {
    ElMessage.error((e instanceof Error ? e.message : '') || t('wrongBook.deleteError'))
  }
}

onMounted(async () => {
  await Promise.all([load(), refreshTagOptions()])
})
</script>

<style scoped lang="scss">
.wrong-book-page {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}

.filter-select {
  width: 220px;

  &--sm {
    width: 140px;
  }
}

.filter-date {
  width: 260px;
}

.tag-chip {
  margin-right: 4px;
  margin-bottom: 2px;
}

.muted {
  color: var(--el-text-color-placeholder);
}
</style>
