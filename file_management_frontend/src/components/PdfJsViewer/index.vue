<template>
    <div class="pdf-js-viewer">
        <div v-if="totalPages > 0" class="pdf-toolbar">
            <button type="button" class="pdf-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
                ‹
            </button>
            <span class="page-indicator">{{ currentPage }} / {{ totalPages }}</span>
            <button
                type="button"
                class="pdf-btn"
                :disabled="currentPage >= totalPages"
                @click="goToPage(currentPage + 1)"
            >
                ›
            </button>
            <button type="button" class="pdf-btn" :disabled="scale <= 0.6" @click="changeScale(-0.1)">−</button>
            <span class="zoom-indicator">{{ Math.round(scale * 100) }}%</span>
            <button type="button" class="pdf-btn" :disabled="scale >= 2.4" @click="changeScale(0.1)">+</button>
        </div>

        <div ref="scrollRef" class="pdf-scroll" @scroll="onScroll">
            <div
                v-for="n in totalPages"
                :key="`${documentKey}-${n}`"
                :ref="(el) => setPageEl(n, el as HTMLElement | null)"
                class="pdf-page-wrap"
                :data-page="n"
            >
                <div class="pdf-page-inner">
                    <canvas :ref="(el) => setCanvasEl(n, el as HTMLCanvasElement | null)" class="pdf-page-canvas" />
                    <div :ref="(el) => setTextLayerEl(n, el as HTMLDivElement | null)" class="textLayer" />
                    <div class="selection-highlight-layer" aria-hidden="true" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted, nextTick } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfTextSelection } from '@/composables/usePdfTextSelection'
import 'pdfjs-dist/web/pdf_viewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString()

const props = withDefaults(
    defineProps<{
        /** 完整 PDF 请求 URL（含 token） */
        sourceUrl: string
        /** URL 变化时用于强制重载 */
        documentKey?: string | number
        /** 加载完成后跳转到该页（1-based） */
        restorePage?: number | null
        /** 附加请求头（如 Authorization） */
        requestHeaders?: Record<string, string>
    }>(),
    {
        documentKey: 'default',
        restorePage: null,
        requestHeaders: () => ({}),
    },
)

const emit = defineEmits<{
    (e: 'loaded', payload: { totalPages: number; hasSelectableText: boolean }): void
    (e: 'error', message: string): void
    (e: 'pageChange', page: number): void
    (e: 'selection-change', text: string): void
}>()

const scrollRef = ref<HTMLDivElement>()
const totalPages = ref(0)
const currentPage = ref(1)
const scale = ref(1.15)

const pageEls = new Map<number, HTMLElement>()
const canvasEls = new Map<number, HTMLCanvasElement>()
const textLayerEls = new Map<number, HTMLDivElement>()
const textLayerInstances = new Map<number, pdfjsLib.TextLayer>()
const renderedPages = new Set<number>()
const pageRenderTasks = new Map<number, Promise<void>>()

let pdfDoc: PDFDocumentProxy | null = null
let loadToken = 0
let observer: IntersectionObserver | null = null
let scrollRaf = 0
let alive = true

const {
    selectedText,
    attachSelectionListeners,
    detachSelectionListeners,
} = usePdfTextSelection(scrollRef)

function safeEmit<E extends 'loaded' | 'error' | 'pageChange' | 'selection-change'>(
    event: E,
    ...args: E extends 'loaded'
        ? [{ totalPages: number; hasSelectableText: boolean }]
        : E extends 'error'
          ? [string]
          : E extends 'selection-change'
            ? [string]
            : [number]
) {
    if (!alive) return
    // @ts-expect-error vue emit overload
    emit(event, ...args)
}

/** 与后端 MIN_PDF_TEXT_CHARS 对齐：探测前几页文字层是否足够可划词 */
const MIN_SELECTABLE_TEXT_CHARS = 30
/** 最多探测页数，避免大 PDF 打开过慢 */
const MAX_TEXT_PROBE_PAGES = 5

/** 抽样探测 PDF 是否有可选中文字层（扫描件通常为 0） */
async function probeHasSelectableText(doc: PDFDocumentProxy): Promise<boolean> {
    const limit = Math.min(doc.numPages, MAX_TEXT_PROBE_PAGES)
    let total = 0
    for (let pageNum = 1; pageNum <= limit; pageNum++) {
        const page = await doc.getPage(pageNum)
        const content = await page.getTextContent({ includeMarkedContent: false })
        for (const item of content.items) {
            if (item && typeof item === 'object' && 'str' in item) {
                const str = (item as { str?: string }).str
                if (typeof str === 'string') total += str.trim().length
            }
        }
        if (total >= MIN_SELECTABLE_TEXT_CHARS) return true
    }
    return false
}

function setPageEl(page: number, el: HTMLElement | null) {
    if (el) pageEls.set(page, el)
    else pageEls.delete(page)
}

function setCanvasEl(page: number, el: HTMLCanvasElement | null) {
    if (el) canvasEls.set(page, el)
    else canvasEls.delete(page)
}

function setTextLayerEl(page: number, el: HTMLDivElement | null) {
    if (el) textLayerEls.set(page, el)
    else textLayerEls.delete(page)
}

function cancelTextLayers() {
    for (const layer of textLayerInstances.values()) {
        layer.cancel()
    }
    textLayerInstances.clear()
    for (const el of textLayerEls.values()) {
        el.replaceChildren()
    }
}

async function waitForPageReady(token: number, page: number, attempts = 50) {
    for (let i = 0; i < attempts; i++) {
        if (token !== loadToken) return
        if (pageEls.has(page) && canvasEls.has(page) && textLayerEls.has(page)) return
        await nextTick()
    }
}

async function loadDocument() {
    const token = ++loadToken
    const pageToRestore = props.restorePage
    destroyObserver()
    cancelTextLayers()
    void pdfDoc?.cleanup()
    pdfDoc = null
    totalPages.value = 0
    currentPage.value = 1
    renderedPages.clear()
    pageRenderTasks.clear()
    pageEls.clear()
    canvasEls.clear()
    textLayerEls.clear()

    if (!props.sourceUrl) return

    try {
        const res = await fetch(props.sourceUrl, {
            headers: props.requestHeaders,
            credentials: 'include',
            cache: 'no-store',
        })
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.arrayBuffer()
        if (token !== loadToken) return

        const doc = await pdfjsLib.getDocument({ data }).promise
        if (token !== loadToken) {
            void doc.cleanup()
            return
        }

        pdfDoc = doc
        totalPages.value = doc.numPages

        await nextTick()
        if (token !== loadToken) return
        await waitForPageReady(token, pageToRestore ?? 1)
        if (token !== loadToken) return
        setupObserver()

        const target =
            pageToRestore != null ? Math.min(Math.max(1, pageToRestore), doc.numPages) : 1
        await goToPage(target)
        if (token !== loadToken) return

        const hasSelectableText = await probeHasSelectableText(doc)
        if (token !== loadToken) return

        safeEmit('loaded', { totalPages: doc.numPages, hasSelectableText })
    } catch (err) {
        if (token !== loadToken) return
        const msg = err instanceof Error ? err.message : 'PDF load failed'
        safeEmit('error', msg)
    }
}

async function renderPage(pageNum: number) {
    if (!pdfDoc || renderedPages.has(pageNum)) return

    const inflight = pageRenderTasks.get(pageNum)
    if (inflight) return inflight

    const token = loadToken
    const task = (async () => {
        try {
            await waitForPageReady(token, pageNum)
            if (token !== loadToken || !pdfDoc || renderedPages.has(pageNum)) return

            const canvas = canvasEls.get(pageNum)
            const textLayerEl = textLayerEls.get(pageNum)
            if (!canvas || !textLayerEl) return

            const page = await pdfDoc.getPage(pageNum)
            if (token !== loadToken) return

            const viewport = page.getViewport({ scale: scale.value, rotation: page.rotate })
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            textLayerEl.style.width = `${Math.floor(viewport.width)}px`
            textLayerEl.style.height = `${Math.floor(viewport.height)}px`

            textLayerInstances.get(pageNum)?.cancel()
            textLayerEl.replaceChildren()

            await page.render({ canvasContext: ctx, viewport, canvas }).promise
            if (token !== loadToken) return

            const textContent = await page.getTextContent()
            if (token !== loadToken) return

            const textLayer = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayerEl,
                viewport,
            })
            textLayerInstances.set(pageNum, textLayer)
            await textLayer.render()
            if (token !== loadToken) return

            const host = textLayerEl as HTMLElement & {
                __pdfTextDivs?: HTMLElement[]
                __pdfTextStrs?: string[]
                __pdfTextItems?: { str: string; transform: number[]; width: number; height: number }[]
                __pdfViewport?: { scale: number; width: number; height: number; convertToViewportRectangle: (rect: number[]) => number[] }
            }
            host.__pdfTextDivs = textLayer.textDivs
            host.__pdfTextStrs = textLayer.textContentItemsStr
            host.__pdfTextItems = textContent.items as { str: string; transform: number[]; width: number; height: number }[]
            host.__pdfViewport = viewport

            textLayerEl.querySelector('.endOfContent')?.remove()
            const endOfContent = document.createElement('div')
            endOfContent.className = 'endOfContent'
            textLayerEl.append(endOfContent)

            renderedPages.add(pageNum)
        } finally {
            pageRenderTasks.delete(pageNum)
        }
    })()

    pageRenderTasks.set(pageNum, task)
    return task
}

function setupObserver() {
    destroyObserver()
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const page = Number((entry.target as HTMLElement).dataset.page)
                if (Number.isFinite(page)) void renderPage(page)
            }
        },
        { root: scrollRef.value, rootMargin: '200px 0px' },
    )
    for (const el of pageEls.values()) {
        observer.observe(el)
    }
}

function destroyObserver() {
    observer?.disconnect()
    observer = null
}

function detectCurrentPage() {
    const root = scrollRef.value
    if (!root || totalPages.value === 0) return

    const rootRect = root.getBoundingClientRect()
    const mid = rootRect.top + rootRect.height * 0.35
    let bestPage = currentPage.value
    let bestDist = Infinity

    for (const [page, el] of pageEls.entries()) {
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const dist = Math.abs(center - mid)
        if (dist < bestDist) {
            bestDist = dist
            bestPage = page
        }
    }

    if (bestPage !== currentPage.value) {
        currentPage.value = bestPage
        safeEmit('pageChange', bestPage)
    }
}

function onScroll() {
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        detectCurrentPage()
    })
}

watch(selectedText, (text) => {
    safeEmit('selection-change', text)
})

onMounted(() => {
    attachSelectionListeners()
})

async function goToPage(page: number) {
    if (totalPages.value === 0) return
    const n = Math.min(Math.max(1, page), totalPages.value)
    currentPage.value = n
    safeEmit('pageChange', n)
    await renderPage(n)
    await nextTick()
    const el = pageEls.get(n)
    if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'auto' })
        detectCurrentPage()
    }
}

async function changeScale(delta: number) {
    const next = Math.min(2.4, Math.max(0.6, Math.round((scale.value + delta) * 10) / 10))
    if (next === scale.value) return
    scale.value = next
    renderedPages.clear()
    pageRenderTasks.clear()
    cancelTextLayers()
    const keep = currentPage.value
    await nextTick()
    setupObserver()
    await goToPage(keep)
}

function getCurrentPage(): number {
    return currentPage.value
}

watch(
    () => [props.sourceUrl, props.documentKey] as const,
    () => {
        void loadDocument()
    },
    { immediate: true },
)

onUnmounted(() => {
    alive = false
    loadToken++
    detachSelectionListeners()
    destroyObserver()
    cancelTextLayers()
    void pdfDoc?.cleanup()
    pdfDoc = null
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
})

defineExpose({ getCurrentPage, goToPage, scrollRef })
</script>

<style lang="scss" scoped>
.pdf-js-viewer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #525659;
}

.pdf-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 12px;
    background: #323639;
    color: #f1f1f1;
    flex-shrink: 0;
    border-bottom: 1px solid #1a1a1a;
}

.pdf-btn {
    min-width: 32px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #5a5f63;
    border-radius: 4px;
    background: #474b4f;
    color: #f1f1f1;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;

    &:hover:not(:disabled) {
        background: #5a5f63;
    }

    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
}

.page-indicator,
.zoom-indicator {
    font-size: 13px;
    min-width: 72px;
    text-align: center;
}

.pdf-scroll {
    flex: 1;
    overflow: auto;
    padding: 16px 0;
}

.pdf-page-wrap {
    display: flex;
    justify-content: center;
    margin: 0 auto 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.pdf-page-inner {
    position: relative;
    line-height: 1;
}

.pdf-page-canvas {
    display: block;
    background: #fff;
}

:deep(.textLayer) {
    position: absolute;
    inset: 0;
    overflow: hidden;
    line-height: 1;
    z-index: 2;
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
}

:deep(.textLayer ::selection) {
    background: rgba(24, 144, 255, 0.38) !important;
}

:deep(.textLayer ::-moz-selection) {
    background: rgba(24, 144, 255, 0.38) !important;
}

.selection-highlight-layer {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    overflow: hidden;
}

:deep(.pdf-selection-highlight-rect) {
    position: absolute;
    background: rgba(24, 144, 255, 0.38);
    border-radius: 1px;
    pointer-events: none;
}
</style>
