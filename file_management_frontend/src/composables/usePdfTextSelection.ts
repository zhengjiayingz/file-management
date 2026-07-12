import { ref, type Ref } from 'vue'

const MIN_SELECTION_LEN = 2
const MAX_SELECTION_LEN = 8000
const HIGHLIGHT_CLASS = 'pdf-selection-highlight-rect'
const SAME_LINE_THRESHOLD_PX = 8

type ClientPoint = { x: number; y: number }

type TextItem = {
  str: string
  transform: number[]
  width: number
  height: number
}

type ViewportLike = {
  scale: number
  width: number
  height: number
  convertToViewportRectangle: (rect: number[]) => number[]
}

type TextLayerData = {
  el: HTMLElement
  items: TextItem[]
  viewport: ViewportLike
  /** 每个 item 在 viewport 坐标系下的包围盒 */
  rects: DOMRect[]
  /** item 所属的 pageInner */
  pageInner: HTMLElement
}

type SelectionPart = {
  data: TextLayerData
  itemIdx: number
  start: number
  end: number
  /** 高亮矩形（相对 pageInner） */
  rect: { left: number; top: number; right: number; bottom: number }
}

function normalizeSelectedText(raw: string): string {
  return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function clearHighlightLayers(root: HTMLElement) {
  root.querySelectorAll('.selection-highlight-layer').forEach((layer) => {
    layer.replaceChildren()
  })
}

function dragDistance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

type DragRect = { left: number; top: number; right: number; bottom: number }

function normalizeDragRect(a: ClientPoint, b: ClientPoint): DragRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  }
} 

function rectsIntersect(a: { left: number; right: number; top: number; bottom: number }, b: DragRect): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
}

/** 从 textLayer 元素上读取 pdf.js 原始数据，计算每个 text item 的 viewport 坐标 */
function buildTextLayerData(textLayerEl: HTMLElement, root: HTMLElement): TextLayerData | null {
  const host = textLayerEl as HTMLElement & {
    __pdfTextItems?: TextItem[]
    __pdfViewport?: ViewportLike
  }
  const items = host.__pdfTextItems
  const viewport = host.__pdfViewport
  if (!items?.length || !viewport) return null

  const pageInner = textLayerEl.closest('.pdf-page-inner') as HTMLElement | null
  if (!pageInner || !root.contains(pageInner)) return null

  const rects: DOMRect[] = items.map((item) => {
    if (!item.str || !item.transform) return new DOMRect()
    const t = item.transform
    const tx = t[4] ?? 0
    const ty = t[5] ?? 0
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
      tx,
      ty,
      tx + item.width,
      ty + item.height,
    ])
    const left = Math.min(x1 ?? 0, x2 ?? 0)
    const top = Math.min(y1 ?? 0, y2 ?? 0)
    const right = Math.max(x1 ?? 0, x2 ?? 0)
    const bottom = Math.max(y1 ?? 0, y2 ?? 0)
    return new DOMRect(left, top, right - left, bottom - top)
  })

  return { el: textLayerEl, items, viewport, rects, pageInner }
}

/** 收集 root 下所有已渲染的 textLayer 数据 */
function collectAllTextLayers(root: HTMLElement): TextLayerData[] {
  const results: TextLayerData[] = []
  for (const el of root.querySelectorAll('.textLayer')) {
    const data = buildTextLayerData(el as HTMLElement, root)
    if (data) results.push(data)
  }
  return results
}

function sortTextLayerData(allData: TextLayerData[]): TextLayerData[] {
  return [...allData].sort((a, b) => {
    const ra = a.pageInner.getBoundingClientRect()
    const rb = b.pageInner.getBoundingClientRect()
    return ra.top - rb.top
  })
}

/** 用 item 的 viewport 宽度做线性映射（PDF text item 内字符等宽近似） */
function charIndexAtX(itemRect: DOMRect, clientX: number, text: string, edge: 'start' | 'end'): number {
  if (!text.length) return 0
  if (itemRect.width <= 0) return edge === 'end' ? text.length : 0
  const ratio = (clientX - itemRect.left) / itemRect.width
  const clamped = Math.max(0, Math.min(1, ratio))
  const idx = edge === 'start' ? Math.floor(clamped * text.length) : Math.ceil(clamped * text.length)
  return Math.max(0, Math.min(text.length, idx))
}

function buildSelectionParts(allData: TextLayerData[], dragRect: DragRect): SelectionPart[] {
  const parts: SelectionPart[] = []

  for (const data of allData) {
    const pageRect = data.pageInner.getBoundingClientRect()

    // 找到该页中与拖选矩形相交的 items
    const hitIndices: number[] = []
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]!
      if (!item.str) continue
      const r = data.rects[i]!
      if (r.width <= 0 || r.height <= 0) continue
      // 转换到 viewport 坐标（rects 已经是 viewport 坐标了，不需要转换）
      const screenRect = {
        left: r.left + pageRect.left,
        right: r.right + pageRect.left,
        top: r.top + pageRect.top,
        bottom: r.bottom + pageRect.top,
      }
      if (rectsIntersect(screenRect, dragRect)) {
        hitIndices.push(i)
      }
    }
    if (hitIndices.length === 0) continue

    // 按阅读顺序排序
    hitIndices.sort((a, b) => {
      const ra = data.rects[a]!
      const rb = data.rects[b]!
      const dy = ra.top - rb.top
      if (Math.abs(dy) > SAME_LINE_THRESHOLD_PX) return dy
      return ra.left - rb.left
    })

    // 分行
    const lines: number[][] = []
    for (const idx of hitIndices) {
      const r = data.rects[idx]!
      const line = lines.find((group) => Math.abs(data.rects[group[0]!]!.top - r.top) <= SAME_LINE_THRESHOLD_PX)
      if (line) line.push(idx)
      else lines.push([idx])
    }
    lines.sort((a, b) => data.rects[a[0]!]!.top - data.rects[b[0]!]!.top)

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]!
      const lineLeft = Math.min(...line.map((i) => data.rects[i]!.left))
      const lineRight = Math.max(...line.map((i) => data.rects[i]!.right))
      const isFirstLine = lineIdx === 0
      const isLastLine = lineIdx === lines.length - 1

      // 在 viewport 坐标系下裁剪
      const clipLeft = isFirstLine ? Math.max(dragRect.left - pageRect.left, lineLeft) : lineLeft
      const clipRight = isLastLine ? Math.min(dragRect.right - pageRect.left, lineRight) : lineRight
      if (clipRight - clipLeft < 0.5) continue

      for (const itemIdx of line) {
        const item = data.items[itemIdx]!
        const r = data.rects[itemIdx]!
        if (r.right <= clipLeft || r.left >= clipRight) continue

        let start = 0
        let end = item.str.length
        if (r.left < clipLeft - 0.5) {
          start = charIndexAtX(r, clipLeft, item.str, 'start')
        }
        if (r.right > clipRight + 0.5) {
          end = charIndexAtX(r, clipRight, item.str, 'end')
        }
        start = Math.max(0, Math.min(start, item.str.length))
        end = Math.max(start, Math.min(end, item.str.length))
        if (end <= start) continue

        parts.push({
          data,
          itemIdx,
          start,
          end,
          rect: {
            left: Math.max(r.left, clipLeft),
            top: r.top,
            right: Math.min(r.right, clipRight),
            bottom: r.bottom,
          },
        })
      }
    }
  }

  return parts
}

function joinSelectionParts(parts: SelectionPart[]): string {
  if (parts.length === 0) return ''

  // 按 page → line → item 顺序
  const sorted = [...parts].sort((a, b) => {
    const pa = a.data.pageInner.getBoundingClientRect()
    const pb = b.data.pageInner.getBoundingClientRect()
    if (Math.abs(pa.top - pb.top) > SAME_LINE_THRESHOLD_PX) return pa.top - pb.top
    const ra = a.data.rects[a.itemIdx]!
    const rb = b.data.rects[b.itemIdx]!
    const dy = ra.top - rb.top
    if (Math.abs(dy) > SAME_LINE_THRESHOLD_PX) return dy
    return ra.left - rb.left
  })

  const lineTexts: string[] = []
  let currentTop = -Infinity
  let currentText = ''
  let prevRight = -Infinity
  let prevHeight = 0
  let prevSliceEnd = ''

  for (const part of sorted) {
    const r = part.data.rects[part.itemIdx]!
    const slice = part.data.items[part.itemIdx]!.str.slice(part.start, part.end)

    if (Math.abs(r.top - currentTop) > SAME_LINE_THRESHOLD_PX) {
      // 新行
      if (currentText) lineTexts.push(normalizeSelectedText(currentText))
      currentText = slice
      currentTop = r.top
      prevRight = r.right
      prevHeight = r.height
      prevSliceEnd = slice
    } else {
      // 同一行——检测 item 间水平间距，间距够大就补空格
      const gap = r.left - prevRight
      const heightRef = Math.max(prevHeight, r.height, 1)
      const alreadyHasSpace = prevSliceEnd.endsWith(' ') || slice.startsWith(' ')
      const needsSpace = gap > heightRef * 0.15 && !alreadyHasSpace
      currentText += needsSpace ? ' ' + slice : slice
      prevRight = Math.max(prevRight, r.right)
      prevHeight = r.height || prevHeight
      prevSliceEnd = slice
    }
  }
  if (currentText) lineTexts.push(normalizeSelectedText(currentText))

  return lineTexts.join(' ')
}

function paintSelectionHighlights(root: HTMLElement, parts: SelectionPart[]) {
  clearHighlightLayers(root)
  if (parts.length === 0) return

  for (const part of parts) {
    const highlightLayer = part.data.pageInner.querySelector<HTMLElement>('.selection-highlight-layer')
    if (!highlightLayer) continue

    const div = document.createElement('div')
    div.className = HIGHLIGHT_CLASS
    div.style.left = `${part.rect.left}px`
    div.style.top = `${part.rect.top}px`
    div.style.width = `${part.rect.right - part.rect.left}px`
    div.style.height = `${part.rect.bottom - part.rect.top}px`
    highlightLayer.appendChild(div)
  }
}

/**
 * PDF 划词：直接用 pdf.js getTextContent() 的原始坐标做命中测试，
 * 绕过 DOM text layer 的 scaleX 变换问题。
 * 高亮和文本都从同一个 text item 数据生成，天然一致。
 */
export function usePdfTextSelection(scrollRef: Ref<HTMLElement | null | undefined>) {
  const selectedText = ref('')
  let isPointerDown = false
  let anchorPoint: ClientPoint | null = null
  let activeParts: SelectionPart[] = []
  let hasMeaningfulDrag = false

  function getRoot(): HTMLElement | null {
    return scrollRef.value ?? null
  }

  function clearSelection() {
    selectedText.value = ''
    activeParts = []
    anchorPoint = null
    hasMeaningfulDrag = false
    const root = getRoot()
    if (root) clearHighlightLayers(root)
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) sel.removeAllRanges()
  }

  function applyParts(parts: SelectionPart[]): string {
    const root = getRoot()
    if (!root) return ''

    activeParts = parts
    paintSelectionHighlights(root, parts)

    const text = joinSelectionParts(parts)
    if (!text || text.length < MIN_SELECTION_LEN) {
      selectedText.value = ''
      return ''
    }
    const clipped = text.length > MAX_SELECTION_LEN ? text.slice(0, MAX_SELECTION_LEN) : text
    selectedText.value = clipped
    return clipped
  }

  function updateDragSelection(point: ClientPoint) {
    if (!anchorPoint) return
    const root = getRoot()
    if (!root) return

    if (!hasMeaningfulDrag && dragDistance(anchorPoint, point) < 4) {
      activeParts = []
      clearHighlightLayers(root)
      if (!isPointerDown) selectedText.value = ''
      return
    }

    hasMeaningfulDrag = true
    const dragRect = normalizeDragRect(anchorPoint, point)
    const allData = sortTextLayerData(collectAllTextLayers(root))
    const parts = buildSelectionParts(allData, dragRect)
    applyParts(parts)
  }
  // 拖动过程中持续更新选区
  function onDocumentPointerMove(ev: PointerEvent) {
    if (!isPointerDown) return
    updateDragSelection({ x: ev.clientX, y: ev.clientY })
  }

  function onDocumentPointerUp(ev: PointerEvent) {
    if (!isPointerDown) return
    isPointerDown = false
    updateDragSelection({ x: ev.clientX, y: ev.clientY })
    anchorPoint = null
    hasMeaningfulDrag = false
  }
  // 用户在 .textLayer 上按下，记录起点
  function onPointerDown(ev: PointerEvent) {
    if (ev.button !== 0) return
    const root = getRoot()
    if (!root) return

    const textLayer = (ev.target as HTMLElement | null)?.closest('.textLayer')
    if (!textLayer || !root.contains(textLayer)) return

    ev.preventDefault()
    const sel = window.getSelection()
    if (sel) sel.removeAllRanges()

    isPointerDown = true
    hasMeaningfulDrag = false
    anchorPoint = { x: ev.clientX, y: ev.clientY }
    activeParts = []

    clearHighlightLayers(root)
    selectedText.value = ''
  }

  function attachSelectionListeners() {
    detachSelectionListeners()
    const root = getRoot()
    if (!root) return

    root.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onDocumentPointerMove)
    document.addEventListener('pointerup', onDocumentPointerUp)
    document.addEventListener('pointercancel', onDocumentPointerUp)
  }

  function detachSelectionListeners() {
    const root = getRoot()
    if (root) {
      root.removeEventListener('pointerdown', onPointerDown)
    }
    document.removeEventListener('pointermove', onDocumentPointerMove)
    document.removeEventListener('pointerup', onDocumentPointerUp)
    document.removeEventListener('pointercancel', onDocumentPointerUp)
    isPointerDown = false
    clearSelection()
  }

  function finalizeSelection(): string {
    return selectedText.value
  }

  return {
    selectedText,
    onPointerDown,
    finalizeSelection,
    clearSelection,
    attachSelectionListeners,
    detachSelectionListeners,
    MIN_SELECTION_LEN,
    MAX_SELECTION_LEN,
  }
}
