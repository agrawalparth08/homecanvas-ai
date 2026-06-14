import * as pdfjs from 'pdfjs-dist';
import './pdf'; // side-effect: configures pdfjs GlobalWorkerOptions.workerSrc
import { operatorListToColorSegments } from '@lib/ingestion/pdf-operator-segments';
import { primitivePlanFromPdfSegments, type PdfText } from '@lib/ingestion/pdf-to-plan';
import { maskFromGrayscale } from '@lib/extraction/image-mask';
import { primitivePlanFromMask } from '@lib/extraction/raster-to-plan';
import type { PrimitivePlan } from '@lib/extraction/primitive-plan';

/**
 * No-CAD front doors (client side). Both run entirely in the browser — the plan
 * never leaves the machine — and delegate the geometry to the pure, unit-tested
 * lib modules, so this file is only the pdfjs / canvas glue. Output is a
 * PrimitivePlan, which POSTs to /api/private-home/build-scene (the shared spine).
 */

/** Vector PDF: pdfjs operator list + text labels -> PrimitivePlan. */
export async function planFromPdf(url: string, page = 1, opts?: { unitsToMm?: number }): Promise<PrimitivePlan> {
  const task = pdfjs.getDocument({ url });
  const doc = await task.promise;
  try {
    const pageObj = await doc.getPage(page);
    const opList = await pageObj.getOperatorList();
    const segs = operatorListToColorSegments(
      { fnArray: opList.fnArray, argsArray: opList.argsArray },
      pdfjs.OPS as unknown as Record<string, number>,
    );
    const tc = await pageObj.getTextContent();
    const texts: PdfText[] = tc.items
      .map((it) => ('str' in it ? { str: it.str, x: it.transform[4] ?? 0, y: it.transform[5] ?? 0 } : null))
      .filter((t): t is PdfText => t !== null);
    return primitivePlanFromPdfSegments(segs, texts, opts);
  } finally {
    void task.destroy();
  }
}

/** Raster image: grayscale -> Otsu wall mask -> vectorized walls -> PrimitivePlan. */
export async function planFromImage(src: string, mmPerPx: number): Promise<PrimitivePlan> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not get 2d canvas context');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Rec. 601 luma; alpha ignored (white-matted PDFs/scans read as paper).
    gray[i] = (data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114) | 0;
  }
  const mask = maskFromGrayscale(gray, w, h);
  return primitivePlanFromMask(mask, { mmPerPx });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
