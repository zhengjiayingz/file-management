/**
 * F-30：服务端把 PDF 某一页渲成 PNG，供扫描件 OCR 使用。
 * 技术：pdfjs-dist（打开/排版）+ @napi-rs/canvas（Node 无 DOM canvas）。
 */

// @napi-rs/canvas 是给 Node.js 用的 Canvas 实现：在没有浏览器 DOM 的服务端，
// 也能像浏览器一样创建画布、用 2D API 绘图，并导出 PNG/JPEG 等图片。
import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import {
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

/** 默认渲页倍率：兼顾 OCR 清晰度与体积/耗时 */
export const DEFAULT_PDF_RENDER_SCALE = 2;

/** pdfjs 渲页时持有的 canvas 与 2D 上下文一对 */
type CanvasAndContext = {
  /** @napi-rs/canvas 画布实例 */
  canvas: Canvas;
  /** 2D 绘制上下文，交给 pdfjs page.render */
  context: SKRSContext2D;
};

/**
 * 供 pdfjs 在 Node 里创建/重置/销毁 canvas。
 * 浏览器有 DOM canvas；服务端必须用 @napi-rs/canvas 实现同一套工厂接口。
 */
class NapiCanvasFactory {
  /** 按视口宽高创建空白画布 */
  create(width: number, height: number): CanvasAndContext {
    // 一块有宽高的像素缓冲区（画布本体），刚创建时是空白的。
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    // 真正往上面画点、线、文字、图像，全靠 context 的方法（fillRect、drawImage、fillText 等
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  /** 复用已有画布时调整尺寸（pdfjs 可能回调） */
  reset(canvasAndContext: CanvasAndContext, width: number, height: number) {
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }

  /** 渲完后释放画布占用（置零宽高即可） */
  destroy(canvasAndContext: CanvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

/**
 * 从 PDF 二进制打开文档代理（PDFDocumentProxy）。
 * 调用方用完后必须 `await pdf.destroy()`，避免句柄泄漏。
 */
export async function openPdfDocument(
  buffer: Buffer,
): Promise<PDFDocumentProxy> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false, // 禁止用 eval 执行 PDF 里的函数字符串。略损性能，但更安全，适合服务端。
    useWorkerFetch: false, // Worker 里不用 Fetch 拉 CMap/标准字体。Node 没有浏览器那套网络环境，关掉更稳妥。
    isOffscreenCanvasSupported: false, // 不用浏览器的 OffscreenCanvas。服务端没有 DOM,改用 @napi-rs/canvas
    // @ts-expect-error pdfjs 运行时接受自定义 canvasFactory
    canvasFactory: new NapiCanvasFactory(), // 自定义画布工厂：create/reset/destroy 都走 @napi-rs/canvas，让 pdfjs 在 Node 里也能渲页
  });
  return loadingTask.promise;
}

/**
 * 将「已打开」的 PDF 中指定页渲成 PNG Buffer。
 * @param pdf 已 open 的文档
 * @param pageNum 页码，从 1 开始
 * @param scale 渲页倍率，默认 DEFAULT_PDF_RENDER_SCALE
 */
export async function renderOpenedPdfPageToPng(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale = DEFAULT_PDF_RENDER_SCALE,
): Promise<Buffer> {
  if (pageNum < 1 || pageNum > pdf.numPages) {
    throw new Error(`PDF 页码越界: ${pageNum}/${pdf.numPages}`);
  }
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvasFactory = new NapiCanvasFactory();
  const canvasAndContext = canvasFactory.create(
    viewport.width,
    viewport.height,
  );

  try {
    await page.render({
      canvasContext: canvasAndContext.context as never,
      viewport,
      // @ts-expect-error 显式传入 canvasFactory，避免依赖 getDocument 上的工厂
      canvasFactory,
    }).promise;
    return Buffer.from(canvasAndContext.canvas.toBuffer('image/png'));
  } finally {
    canvasFactory.destroy(canvasAndContext);
  }
}

/**
 * 一次性：打开 PDF → 渲指定页 → 关闭文档。
 * 适合单页冒烟；批量 OCR 时请改用 openPdfDocument + renderOpenedPdfPageToPng，避免反复打开。
 */
export async function renderPdfPageToPng(
  buffer: Buffer,
  pageNum: number,
  scale = DEFAULT_PDF_RENDER_SCALE,
): Promise<Buffer> {
  const pdf = await openPdfDocument(buffer);
  try {
    return await renderOpenedPdfPageToPng(pdf, pageNum, scale);
  } finally {
    await pdf.destroy();
  }
}
