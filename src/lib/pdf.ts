import * as pdfjs from 'pdfjs-dist';

/**
 * Client-side PDF rasterization (pdfjs-dist 6, ESM). Renders a page to a PNG
 * data URL entirely in the browser — the plan never leaves the machine. The
 * worker URL is fingerprinted by Vite via import.meta.url.
 */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface RasterPage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  page: number;
  pageCount: number;
}

export async function rasterizePdf(url: string, page = 1, scale = 2): Promise<RasterPage> {
  const task = pdfjs.getDocument({ url });
  const doc = await task.promise;
  const pageObj = await doc.getPage(page);
  const viewport = pageObj.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not get 2d canvas context');
  // White background so transparent PDFs read as paper.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pageObj.render({ canvas, canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');
  const pageCount = doc.numPages;
  void task.destroy();
  return { dataUrl, widthPx: canvas.width, heightPx: canvas.height, page, pageCount };
}

/** An already-raster image (PNG/JPG): read its natural dimensions + data URL. */
export async function loadRasterImage(url: string): Promise<RasterPage> {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
  return { dataUrl, widthPx: dims.w, heightPx: dims.h, page: 1, pageCount: 1 };
}
