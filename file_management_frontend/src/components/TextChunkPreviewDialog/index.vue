<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    class="text-chunk-preview-dialog"
    width="min(96vw, 920px)"
    top="4vh"
    destroy-on-close
    @open="onOpen"
    @opened="onDialogOpened"
    @closed="reset"
  >
    <p class="hint-line">{{ t('preview.textChunkBytesHint') }}</p>
    <p v-if="totalSize > 0" class="meta-line">
      {{
        t('preview.textChunkProgress', {
          loaded: nextOffset,
          total: totalSize
        })
      }}
    </p>
    <div class="text-chunk-options">
      <el-checkbox v-model="reflowForReading" :disabled="initialLoading">
        {{ t('preview.textChunkReflow') }}
      </el-checkbox>
    </div>
    <div
      ref="scrollRef"
      v-loading="initialLoading"
      class="text-chunk-scroll"
      @scroll.passive="onScroll"
    >
      <div
        v-if="!initialLoading"
        class="vlist-inner"
        :style="{
          height: `${vTotalSize}px`,
          position: 'relative',
          width: '100%'
        }"
      >
        <div
          v-for="v in virtualItems"
          :key="String(v.key)"
          :data-index="v.index"
          :ref="onRowRef"
          class="vlist-row"
          :class="{
            'vlist-row--para-indent': !!displayRows[v.index]?.indentFirstLine,
            'vlist-row--blank': !!displayRows[v.index]?.isBlank
          }"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            width: 'auto',
            transform: `translateY(${v.start}px)`
          }"
        >
          {{ displayRows[v.index]?.text ?? '' }}
        </div>
      </div>
      <div v-if="appending && !initialLoading" class="vlist-appending">…</div>
    </div>
    <div v-if="loadError" class="err-line">{{ loadError }}</div>
    <p v-else-if="done && !initialLoading" class="end-line">{{ t('preview.textChunkEnd') }}</p>
    <div class="footer-actions">
      <el-button v-if="!done && !loadingMore && !initialLoading" type="primary" plain @click="loadNext">
        {{ t('preview.textChunkLoadMore') }}
      </el-button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVirtualizer } from '@tanstack/vue-virtual'
import fileApiService from '@api/file'

const CHUNK_BYTES = 256 * 1024
/** 无换行超长行切段，避免单行 DOM 仍过高 */
const VIRTUAL_MAX_LINE = 4000

/**
 * 将常见 txt 中「为纸宽折行」的段内单换行合并，段落仍以空行分隔；合并在宽屏上由 pre-wrap 按容器宽度重排
 */
function reflowBookText(s: string): string {
  const t = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!t.trim()) return ''
  const blocks = t.split(/\n(?:[ \t\u3000]*\n)+/)
  return blocks
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.replace(/[ \t\u3000]+$/g, ''))
        .join('')
    )
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .join('\n\n')
}

const props = defineProps<{
  modelValue: boolean
  fileId: number
  fileName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const dialogTitle = computed(() =>
  props.fileName ? `${t('preview.textChunkTitle')} - ${props.fileName}` : t('preview.textChunkTitle')
)

/** 已顺序拼接的已加载原文（分块接口保证字节顺序，直接 += 与纸面折行/跨块一致） */
const rawText = ref('')
/** 为 true 时按空行分段后合并段内换行，适合纸宽排版的小说；为 false 时与文件换行一致 */
const reflowForReading = ref(true)

const lineRows = computed(() => {
  const raw = rawText.value
  if (!raw) return []
  if (!reflowForReading.value) {
    return raw.split(/\r?\n/)
  }
  const merged = reflowBookText(raw)
  if (!merged) return []
  return merged.split(/\n\n+/)
})

/** 展示行；indentFirstLine 仅对自然段首行（2 字）缩进，超长段 4k 续块不缩进 */
type DisplayRow = { text: string; indentFirstLine: boolean; isBlank?: boolean }

const displayRows = computed((): DisplayRow[] => {
  const rows = lineRows.value
  const out: DisplayRow[] = []
  const reflow = reflowForReading.value

  for (let r = 0; r < rows.length; r++) {
    const line = rows[r]!
    if (line.length === 0) {
      out.push({ text: '', indentFirstLine: false, isBlank: true })
      continue
    }

    const isNaturalParaStart = reflow
      ? true
      : r === 0 || (r > 0 && String(rows[r - 1] ?? '').trim() === '')

    if (line.length <= VIRTUAL_MAX_LINE) {
      out.push({ text: line, indentFirstLine: isNaturalParaStart })
      continue
    }

    for (let i = 0; i < line.length; i += VIRTUAL_MAX_LINE) {
      const chunk = line.slice(i, i + VIRTUAL_MAX_LINE)
      out.push({
        text: chunk,
        indentFirstLine: isNaturalParaStart && i === 0
      })
    }
  }
  return out
})

const nextOffset = ref(0)
const totalSize = ref(0)
const done = ref(false)
const initialLoading = ref(false)
const loadingMore = ref(false)
const appending = ref(false)
const loadError = ref('')
const scrollRef = ref<HTMLElement | null>(null)
const fileEncoding = ref<'utf-8' | 'gb18030' | undefined>(undefined)

// 必须整体传入 computed，让 count 为 number；若只写 count: computed(()=>n)，Virtualizer 会把 Ref 当数字用导致 NaN，列表永远空白
const virtualizer = useVirtualizer(
  computed(() => ({
    count: displayRows.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => 25,
    overscan: 12
  }))
)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const vTotalSize = computed(() => virtualizer.value.getTotalSize())

function onRowRef(ref: Element | ComponentPublicInstance | null) {
  const el = ref && typeof ref === 'object' && '$el' in ref ? (ref as ComponentPublicInstance).$el : ref
  virtualizer.value.measureElement(el as HTMLElement)
}

let resizeUnsub: (() => void) | null = null

function attachScrollSizeObserver() {
  resizeUnsub?.()
  resizeUnsub = null
  const el = scrollRef.value
  if (typeof ResizeObserver === 'undefined' || !el) return
  const ro = new ResizeObserver(() => {
    virtualizer.value.measure()
  })
  ro.observe(el)
  resizeUnsub = () => {
    ro.disconnect()
    resizeUnsub = null
  }
}

function scheduleRemeasure() {
  void nextTick(() => {
    requestAnimationFrame(() => {
      virtualizer.value.measure()
    })
  })
}

watch(displayRows, () => {
  scheduleRemeasure()
}, { flush: 'post' })

watch(reflowForReading, () => {
  void nextTick(() => scheduleRemeasure())
})

function onDialogOpened() {
  attachScrollSizeObserver()
  scheduleRemeasure()
  setTimeout(() => virtualizer.value.measure(), 100)
}

onUnmounted(() => {
  resizeUnsub?.()
})

function reset() {
  resizeUnsub?.()
  resizeUnsub = null
  rawText.value = ''
  reflowForReading.value = true
  nextOffset.value = 0
  totalSize.value = 0
  done.value = false
  initialLoading.value = false
  loadingMore.value = false
  appending.value = false
  loadError.value = ''
  fileEncoding.value = undefined
}

async function fetchChunk(fromOffset: number) {
  return fileApiService.getTextFileChunk(
    props.fileId,
    fromOffset,
    CHUNK_BYTES,
    fileEncoding.value
  )
}

async function onOpen() {
  reset()
  initialLoading.value = true
  loadError.value = ''
  try {
    const data = await fetchChunk(0)
    if (data.fileEncoding) fileEncoding.value = data.fileEncoding
    rawText.value += data.text
    nextOffset.value = data.nextOffset
    totalSize.value = data.totalSize
    done.value = data.done
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    loadError.value = msg || t('preview.textChunkError')
  } finally {
    initialLoading.value = false
    await nextTick()
    scheduleRemeasure()
  }
}

async function loadNext() {
  if (done.value || loadingMore.value) return
  loadingMore.value = true
  appending.value = true
  loadError.value = ''
  try {
    const data = await fetchChunk(nextOffset.value)
    if (data.fileEncoding) fileEncoding.value = data.fileEncoding
    rawText.value += data.text
    nextOffset.value = data.nextOffset
    if (data.totalSize) totalSize.value = data.totalSize
    done.value = data.done
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    loadError.value = msg || t('preview.textChunkError')
  } finally {
    loadingMore.value = false
    appending.value = false
    await nextTick()
    scheduleRemeasure()
  }
}

const SCROLL_LOAD_THRESHOLD = 200

function onScroll() {
  const el = scrollRef.value
  if (!el || done.value || loadingMore.value || initialLoading.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_LOAD_THRESHOLD) {
    void loadNext()
  }
}
</script>

<style lang="scss" scoped>
/* 主题里 --el-dialog-width 未覆盖时会回退到 50%（theme-chalk dialog.scss），全屏右侧大片留白时强制拉满 */
.text-chunk-preview-dialog {
  width: min(96vw, 920px) !important;
  max-width: 96vw !important;
  box-sizing: border-box;

  :deep(.el-dialog__body) {
    padding-top: 8px;
    display: block;
    width: 100% !important;
    max-width: none !important;
    box-sizing: border-box;
  }
}

.hint-line {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-line {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.text-chunk-options {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

/* 固定视口高度：仅 max-height 时父级/动画下 clientHeight 可能为 0，导致虚拟列表不渲染 */
.text-chunk-scroll {
  display: block;
  width: 100% !important;
  min-width: 0;
  max-width: none;
  height: min(72vh, 640px);
  min-height: 240px;
  overflow: auto;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 12px 14px;
  box-sizing: border-box;
}

.vlist-inner {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

/* 左对齐、自然字距。首行缩进 2 字用 text-indent: 2em（与正文 em 等宽，符合中文习惯） */
.vlist-row {
  margin: 0;
  font-family: 'Sarasa Term SC', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC',
    ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: var(--el-text-color-primary);
  box-sizing: border-box;
  text-align: start;
  letter-spacing: normal;
  text-justify: auto;
}

.vlist-row--para-indent {
  text-indent: 2em;
}

.vlist-row--blank {
  min-height: 0.75em;
  pointer-events: none;
}

.vlist-appending {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 0 0;
}

.end-line,
.err-line {
  margin: 10px 0 0;
  font-size: 12px;
}

.err-line {
  color: var(--el-color-danger);
}

.footer-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
