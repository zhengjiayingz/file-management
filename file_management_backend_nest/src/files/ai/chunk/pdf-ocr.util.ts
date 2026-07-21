/**
 * F-30：扫描 PDF（无/少文字层）→ 逐页渲图 → OCR → 拼成可索引全文。
 * 复用：pdf-render.util（渲页）+ vision.provider.extractTextFromImage（OCR）。
 */
import { extractTextFromImage } from '@/files/ai/vision/vision.provider';
import { openPdfDocument, renderOpenedPdfPageToPng } from './pdf-render.util';

/** 未配置 env 时，单文件最多 OCR 的页数 */
const DEFAULT_MAX_OCR_PDF_PAGES = 50;

/**
 * PDF 页数超过 OCR 上限时抛出。
 * Worker / API 可直接把 message 展示给用户（提示拆分后再索引）。
 */
export class PdfOcrPageLimitError extends Error {
  /**
   * @param pageCount 实际页数
   * @param maxPages 允许的最大 OCR 页数
   */
  constructor(
    public readonly pageCount: number,
    public readonly maxPages: number,
  ) {
    super(
      `该 PDF 共 ${pageCount} 页，超过 OCR 上限（${maxPages} 页）。请拆分后再建立索引`,
    );
    this.name = 'PdfOcrPageLimitError';
  }
}

/**
 * 从环境变量读取扫描 PDF OCR 页数上限。
 * 对应 `.env`：`AI_MAX_OCR_PDF_PAGES`（非法或未设则回落默认值）。
 */
export function getMaxOcrPdfPages(): number {
  const raw = process.env.AI_MAX_OCR_PDF_PAGES?.trim();
  if (!raw) return DEFAULT_MAX_OCR_PDF_PAGES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_OCR_PDF_PAGES;
  return n;
}

/**
 * extractScannedPdfText 的可选参数。
 */
export type ExtractScannedPdfOptions = {
  /**
   * 每开始 OCR 一页前回调（page / totalPages 均为 1-based
   * 语义：page 从 1 到 total）。
   * 后续可接到索引进度文案「OCR 第 n/m 页」。
   */
  onPageProgress?: (page: number, totalPages: number) => void | Promise<void>;
  /** 覆盖 env 的页数上限（单测可传入小值） */
  maxPages?: number;
};

/**
 * 规范化单页 OCR 文本：统一换行并去掉首尾空白。
 */
function normalizePageOcr(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+\n/g, '\n').trim();
}

/**
 * 对整份 PDF 做扫描件 OCR，返回可交给 chunker 的全文。
 * 页面之间用 `--- Page n ---` 分隔（n 从 1 起）；空白页跳过，全部空白则抛错。
 */
export async function extractScannedPdfText(
  buffer: Buffer,
  options: ExtractScannedPdfOptions = {},
): Promise<string> {
  const maxPages = options.maxPages ?? getMaxOcrPdfPages();
  const pdf = await openPdfDocument(buffer);

  try {
    const totalPages = pdf.numPages;

    if (totalPages > maxPages) {
      throw new PdfOcrPageLimitError(totalPages, maxPages);
    }
    if (totalPages < 1) {
      throw new Error('OCR 未识别到可用文字');
    }

    const parts: string[] = [];

    // 逐页：进度回调 → 渲成 PNG → OCR → 有字则按页拼接
    for (let page = 1; page <= totalPages; page++) {
      await options.onPageProgress?.(page, totalPages);
      //! 把当前页画成 PNG（扫描件本身没有可用文字层）
      const png = await renderOpenedPdfPageToPng(pdf, page);
      //! 视觉模型 OCR，并规范化换行/空白
      const pageText = normalizePageOcr(
        await extractTextFromImage(png, 'image/png'),
      );
      //! 空白页跳过，避免拼出空的 Page 块
      if (pageText) {
        parts.push(`--- Page ${page} ---\n${pageText}`);
      }
    }

    const joined = parts.join('\n\n').trim();
    if (!joined) {
      throw new Error('OCR 未识别到可用文字');
    }
    return joined;
  } finally {
    await pdf.destroy();
  }
}
