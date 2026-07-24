export type SubtitleSegment = {
  text: string
  startMs?: number | null
  endMs?: number | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function pad3(n: number) {
  return String(n).padStart(3, '0')
}

/** 毫秒 → SRT 时间（逗号毫秒） */
export function formatSrtTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const h = Math.floor(total / 3600000)
  const m = Math.floor((total % 3600000) / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(milli)}`
}

/** 毫秒 → VTT 时间（点毫秒） */
export function formatVttTimestamp(ms: number): string {
  return formatSrtTimestamp(ms).replace(',', '.')
}

/**
 * segments → WebVTT 文本（供 &lt;track&gt; / Blob）
 */
export function segmentsToVtt(segments: SubtitleSegment[]): string {
  const lines = ['WEBVTT', '']
  let i = 0
  for (const seg of segments) {
    const text = (seg.text || '').trim()
    if (!text || seg.startMs == null || seg.endMs == null) continue
    const end = Math.max(seg.endMs, seg.startMs + 1)
    lines.push(`${formatVttTimestamp(seg.startMs)} --> ${formatVttTimestamp(end)}`)
    lines.push(text)
    lines.push('')
    i += 1
  }
  if (i === 0) return 'WEBVTT\n'
  return lines.join('\n')
}

/**
 * segments → SRT 文本（供下载）
 */
export function segmentsToSrt(segments: SubtitleSegment[]): string {
  const blocks: string[] = []
  let idx = 1
  for (const seg of segments) {
    const text = (seg.text || '').trim()
    if (!text || seg.startMs == null || seg.endMs == null) continue
    const end = Math.max(seg.endMs, seg.startMs + 1)
    blocks.push(
      String(idx),
      `${formatSrtTimestamp(seg.startMs)} --> ${formatSrtTimestamp(end)}`,
      text,
      '',
    )
    idx += 1
  }
  return blocks.join('\n')
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
