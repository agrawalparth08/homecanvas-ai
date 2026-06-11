/**
 * Browser helper: a reference image (data URL) → PaletteInput. Draws the image
 * to a small offscreen canvas, reads the pixels, and runs the pure
 * lib/extraction/palette engine (median-cut + CIELAB material matching). Fully
 * local — the image never leaves the machine.
 */
import { extractPalette, matchSwatchesToMaterials } from '@lib/extraction/palette';
import type { PaletteInput } from '@lib/agent/palette-apply';

const MAX_DIM = 160; // downscale for fast, stable quantization

export async function imageToPaletteInput(dataUrl: string): Promise<PaletteInput> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('could not decode image'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const swatches = extractPalette(new Uint8Array(data.buffer), w, h, 6);
  return { swatches, candidates: matchSwatchesToMaterials(swatches) };
}

/** Read a File/Blob into a data URL (for the attach button + drag-drop). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}
