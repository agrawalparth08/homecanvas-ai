import * as pdfjs from 'pdfjs-dist';
import './pdf'; // side-effect: configures pdfjs GlobalWorkerOptions.workerSrc
import { operatorListToColorSegments } from '@lib/ingestion/pdf-operator-segments';
import { primitivePlanFromPdfSegments, type PdfText } from '@lib/ingestion/pdf-to-plan';
import { maskFromGrayscale } from '@lib/extraction/image-mask';
import { adaptiveMaskFromGrayscale } from '@lib/extraction/adaptive-mask';
import { estimateSkewAngle, rotateMask } from '@lib/extraction/deskew';
import { primitivePlanFromMask } from '@lib/extraction/raster-to-plan';
import { parsePrimitivePlan, type PrimitivePlan } from '@lib/extraction/primitive-plan';
import { ocrAutoScale } from './ocr-scale';

/** Fraction of wall (true) pixels in a mask — used to spot a bad global threshold. */
function maskDensity(mask: boolean[][]): number {
  let on = 0;
  let total = 0;
  for (const row of mask) {
    total += row.length;
    for (const v of row) if (v) on++;
  }
  return total > 0 ? on / total : 0;
}

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
  // Optional CubiCasa5k booster: if the sidecar has the converted model, let it
  // predict the walls (usually far better than heuristic CV). Silent fallback.
  const boosted = await tryCubicasaBoost(data, w, h, mmPerPx);
  if (boosted) return boosted;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Rec. 601 luma; alpha ignored (white-matted PDFs/scans read as paper).
    gray[i] = (data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114) | 0;
  }
  // Global Otsu first; if it reads implausibly sparse/dense (uneven lighting,
  // shadows), fall back to a local adaptive threshold that handles gradients.
  const otsu = maskFromGrayscale(gray, w, h);
  const dens = maskDensity(otsu);
  const base = dens < 0.004 || dens > 0.45 ? adaptiveMaskFromGrayscale(gray, w, h) : otsu;
  // OCR auto-scale runs on the pre-deskew mask (shares the OCR words' pixel frame;
  // scale is rotation-invariant). Best-effort — null falls back to the caller's
  // mmPerPx, which the verify wizard then lets the user confirm/rescale.
  const ocrMmPerPx = await ocrAutoScale(src, base);
  // Deskew rotated scans/photos so axis-aligned wall detection lands (no-op when
  // the plan is already upright — estimateSkewAngle returns ~0).
  const angle = estimateSkewAngle(base);
  const mask = Math.abs(angle) > 0.005 ? rotateMask(base, angle) : base;
  return primitivePlanFromMask(mask, { mmPerPx: ocrMmPerPx ?? mmPerPx });
}

/**
 * Try the optional CubiCasa5k booster on the sidecar. Sends raw RGBA pixels and
 * returns its PrimitivePlan, or null if the booster is unavailable / errors (the
 * caller then uses the heuristic CV path). Never throws.
 */
async function tryCubicasaBoost(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  mmPerPx: number,
): Promise<PrimitivePlan | null> {
  try {
    const available = await fetch('/api/extract/cubicasa/available')
      .then((r) => r.json())
      .then((d: { available?: boolean }) => d.available === true)
      .catch(() => false);
    if (!available) return null;
    const res = await fetch(`/api/extract/cubicasa?w=${w}&h=${h}&mmPerPx=${mmPerPx}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: rgba.buffer as ArrayBuffer,
    });
    if (!res.ok) return null;
    const { plan } = (await res.json()) as { plan: unknown };
    return parsePrimitivePlan(plan);
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
