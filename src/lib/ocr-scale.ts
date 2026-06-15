import { linesFromMask } from '@lib/extraction/lines-from-mask';
import { dimensionSamples, type OcrWord } from '@lib/extraction/ocr-dimensions';
import { mmPerPxFromDimensions } from '@lib/extraction/auto-scale';

/**
 * Best-effort OCR auto-scale (browser only).
 *
 * tesseract reads dimension labels off the plan image; each is associated with a
 * nearby detected line and converted to a mm/px factor (the pure association +
 * conversion are unit-tested in ocr-dimensions / auto-scale). FULLY ISOLATED:
 * any failure, timeout, or empty result returns null and the caller keeps its
 * default scale — the manual Rescale panel stays the reliable path.
 *
 * Runs on the PRE-deskew mask so its lines share the OCR words' pixel frame
 * (scale is a length ratio, so rotation-invariant).
 */

interface RawBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface RawWord {
  text: string;
  bbox: RawBbox;
}

/** Flatten tesseract's word list, handling both flat `words` and v6 `blocks`. */
function flattenWords(data: { words?: RawWord[]; blocks?: unknown[] | null }): RawWord[] {
  if (Array.isArray(data.words) && data.words.length > 0) return data.words.filter((wd) => !!wd.bbox);
  const out: RawWord[] = [];
  const blocks = (data.blocks ?? []) as Array<{ paragraphs?: Array<{ lines?: Array<{ words?: RawWord[] }> }> }>;
  for (const block of blocks)
    for (const para of block.paragraphs ?? [])
      for (const line of para.lines ?? [])
        for (const wd of line.words ?? []) if (wd && wd.bbox) out.push(wd);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ocr timeout')), ms)),
  ]);
}

export async function ocrAutoScale(imageSrc: string, mask: boolean[][], timeoutMs = 18000): Promise<number | null> {
  try {
    // A WORKER is required: tesseract v6's top-level recognize() omits the output
    // spec, so `blocks` stays null and there's no word geometry. createWorker +
    // recognize(image, options, { blocks: true }) is the only way to get words.
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const result = await withTimeout(worker.recognize(imageSrc, {}, { blocks: true }), timeoutMs);
      const raw = flattenWords(result.data as { words?: RawWord[]; blocks?: unknown[] | null });
      const words: OcrWord[] = raw.map((wd) => ({
        text: wd.text,
        cx: (wd.bbox.x0 + wd.bbox.x1) / 2,
        cy: (wd.bbox.y0 + wd.bbox.y1) / 2,
        w: wd.bbox.x1 - wd.bbox.x0,
        h: wd.bbox.y1 - wd.bbox.y0,
      }));
      if (words.length === 0) return null;
      const res = mmPerPxFromDimensions(dimensionSamples(words, linesFromMask(mask)));
      return res && res.mmPerPx > 0 && Number.isFinite(res.mmPerPx) ? res.mmPerPx : null;
    } finally {
      await worker.terminate();
    }
  } catch {
    return null; // any failure -> caller keeps its default scale
  }
}
