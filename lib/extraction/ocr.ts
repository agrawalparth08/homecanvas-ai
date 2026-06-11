/**
 * OCR + plan-text parsing (Phase 3).
 *
 * tesseract.js (WASM, lazy-loaded so it never bloats the main bundle) reads a
 * rasterized plan into positioned words; parsePlanText then separates room
 * labels from dimension annotations (feet-inches or mm). The parsing is pure
 * and unit-tested; the OCR pass itself is integration.
 */
import { parseFeetInches } from '../geometry/scale';

export interface TextItem { text: string; x: number; y: number; }
export interface PlanText {
  labels: TextItem[];
  dimensions: { value: number; x: number; y: number }[];
}

/** Parse one token as a real-world length in mm: feet-inches (12'6") or plain mm. */
export function parseDimension(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  const ft = parseFeetInches(t);
  if (ft != null) return ft;
  const m = t.match(/^(\d{2,5})(?:\s*mm)?$/i);
  return m ? Number(m[1]) : null;
}

/** Split OCR'd words into room labels vs dimension annotations. */
export function parsePlanText(items: TextItem[]): PlanText {
  const labels: TextItem[] = [];
  const dimensions: { value: number; x: number; y: number }[] = [];
  for (const it of items) {
    const t = it.text.trim();
    if (!t) continue;
    const d = parseDimension(t);
    if (d != null) dimensions.push({ value: d, x: it.x, y: it.y });
    else if (/[a-zA-Z]/.test(t) && t.replace(/[^a-zA-Z]/g, '').length >= 2) labels.push({ text: t, x: it.x, y: it.y });
  }
  return { labels, dimensions };
}

interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; }

/** Recognise a rasterized plan image to positioned words (lazy tesseract.js). */
export async function ocrImage(image: string | Blob): Promise<TextItem[]> {
  const T = (await import('tesseract.js')) as unknown as {
    recognize?: (img: string | Blob, lang: string) => Promise<{ data: { words?: OcrWord[] } }>;
    default?: { recognize: (img: string | Blob, lang: string) => Promise<{ data: { words?: OcrWord[] } }> };
  };
  const recognize = T.recognize ?? T.default?.recognize;
  if (!recognize) throw new Error('tesseract.js recognize unavailable');
  const { data } = await recognize(image, 'eng');
  return (data.words ?? []).map((w) => ({ text: w.text, x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2 }));
}
