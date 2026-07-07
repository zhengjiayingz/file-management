import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(text: string): string {
  if (!text.trim()) return ''
  const html = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(html)
}
