/**
 * Position-aware PDF text extraction (pdfjs-dist).
 * Reconstructs spaces from glyph x-gaps — fixes lecture PDFs where
 * pdf-parse returns zero space characters.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

type TextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

/** Gap (relative to char width) above which we insert a space between items */
const SPACE_GAP_RATIO = 0.25;
/** Vertical jump (relative to font height) treated as a new line */
const NEWLINE_Y_RATIO = 0.6;

function itemMetrics(item: TextItem) {
  const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
  const x = transform[4] ?? 0;
  const y = transform[5] ?? 0;
  const width = item.width ?? 0;
  const height =
    item.height && item.height > 0
      ? item.height
      : Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || 12;
  return { x, y, width, height, str: item.str ?? '' };
}

function pageItemsToText(items: TextItem[]): string {
  const lines: string[] = [];
  let line = '';
  let last: ReturnType<typeof itemMetrics> | null = null;

  const flush = () => {
    const trimmed = line.replace(/[ \t]+$/g, '');
    if (trimmed.length > 0) lines.push(trimmed);
    line = '';
    last = null;
  };

  for (const raw of items) {
    if (typeof raw.str !== 'string') continue;
    const cur = itemMetrics(raw);
    if (!cur.str) {
      if (raw.hasEOL) flush();
      continue;
    }

    if (last) {
      const yJump = Math.abs(cur.y - last.y);
      const avgHeight = Math.max((cur.height + last.height) / 2, 1);
      if (yJump > avgHeight * NEWLINE_Y_RATIO) {
        flush();
      } else {
        const gap = cur.x - (last.x + last.width);
        const avgChar =
          last.width / Math.max(last.str.replace(/\s/g, '').length || 1, 1);
        const needSpace =
          gap > avgChar * SPACE_GAP_RATIO &&
          !/\s$/.test(line) &&
          !/^\s/.test(cur.str);
        if (needSpace) line += ' ';
      }
    }

    line += cur.str;
    if (raw.hasEOL) {
      flush();
    } else {
      last = cur;
    }
  }
  flush();
  return lines.join('\n');
}

/** pdfjs + 坐标间距：补回阅读器复制时才有的单词空格 */
export async function extractPdfTextWithPdfJs(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent({
        includeMarkedContent: false,
      });
      const pageText = pageItemsToText(content.items as TextItem[]);
      if (pageText.trim()) pages.push(pageText);
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join('\n\n');
}
