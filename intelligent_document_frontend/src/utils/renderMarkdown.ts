import DOMPurify from 'dompurify'
import katex from 'katex'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** 用 KaTeX 渲染一段 LaTeX；失败时回退为转义原文 */
function renderLatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    })
  } catch {
    const escaped = tex
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    //  KaTeX 渲染失败时的回退 HTML，两者都加了 class="katex-fallback"，
    // 方便用 CSS 统一标成「未渲染成功的公式原文」。
    return displayMode
      ? `<pre class="katex-fallback">${escaped}</pre>`
      : `<code class="katex-fallback">${escaped}</code>`
  }
}

/**
 * Markdown → 安全 HTML；支持 $...$ / $$...$$（先抽公式再 marked，避免定界符被拆坏）
 */
export function renderMarkdown(text: string): string {
  if (!text.trim()) return ''
  const slots: string[] = []
  /** 把公式换成占位符，避免 marked 改坏 LaTeX */
  const withPlaceholders = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      const i = slots.length
      slots.push(renderLatex(tex.trim(), true))
      return `%%KATEX${i}%%`
    })
    .replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => {
      const i = slots.length
      slots.push(renderLatex(tex.trim(), false))
      return `%%KATEX${i}%%`
    })
  let html = marked.parse(withPlaceholders, { async: false }) as string
  html = html.replace(/%%KATEX(\d+)%%/g, (_m, idx: string) => {
    return slots[Number(idx)] ?? ''
  })
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'annotation'],
    ADD_ATTR: ['class', 'style', 'xmlns', 'encoding'],
  })
}
