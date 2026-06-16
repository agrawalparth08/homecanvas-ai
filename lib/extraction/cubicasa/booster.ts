/**
 * CubiCasa5k extraction BOOSTER — optional, PERSONAL-USE ONLY.
 *
 * CubiCasa5k weights are CC-BY-NC: we never bundle them and the core app never
 * depends on this. The model is supplied by the user (see ./README.md) and
 * onnxruntime-web is an OPTIONAL peer dep loaded lazily — if it's absent this
 * returns null and the heuristic CV pipeline is used instead. Output joins the
 * exact same `buildSceneFromPrimitives` spine as every other path.
 *
 * Split so the deterministic parts (preprocess, argmax, mask→plan) are unit-tested
 * even without the model/runtime; only `runCubicasaBooster` needs onnxruntime.
 */
import { argmaxClassMap, cubicasaSegToPlan, type CubicasaSeg } from './masks-to-plan';
import type { RasterWallOptions } from '../raster-walls';
import type { PrimitivePlan } from '../primitive-plan';

/**
 * Model I/O geometry of the published 512² CubiCasa5k. Its single output is 44
 * channels = 21 junction heatmaps + 12 room classes (starting at `roomOffset`) +
 * 11 icon classes. We only need the room slice; wall is room-class index 2.
 */
export const CUBICASA_INPUT = {
  width: 512,
  height: 512,
  totalChannels: 44,
  roomOffset: 21,
  roomClasses: 12,
} as const;

export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/**
 * Nearest-resize an RGBA image to dst×dst and normalize to a CHW Float32 tensor
 * in [-1, 1] — CubiCasa5k's training normalization `2*(x/255) - 1` (see the repo's
 * floortrans/loaders/svg_loader.py). Feeding [0,1] runs without error but shifts
 * every input out of the trained range and degrades predictions. 3 channels,
 * alpha dropped. Pure + deterministic — the model-input prep, testable without
 * onnxruntime.
 */
export function resizeNormalizeChw(image: RgbaImage, dstW: number, dstH: number): Float32Array {
  const { data, width: sw, height: sh } = image;
  const out = new Float32Array(3 * dstW * dstH);
  const sampleAt = (sx: number, sy: number, ch: number): number => {
    const xi = Math.min(sw - 1, Math.max(0, Math.round(sx)));
    const yi = Math.min(sh - 1, Math.max(0, Math.round(sy)));
    return 2 * ((data[(yi * sw + xi) * 4 + ch] ?? 0) / 255) - 1;
  };
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = sw === dstW ? x : (x / Math.max(1, dstW - 1)) * (sw - 1);
      const sy = sh === dstH ? y : (y / Math.max(1, dstH - 1)) * (sh - 1);
      const p = y * dstW + x;
      out[0 * dstW * dstH + p] = sampleAt(sx, sy, 0); // R
      out[1 * dstW * dstH + p] = sampleAt(sx, sy, 1); // G
      out[2 * dstW * dstH + p] = sampleAt(sx, sy, 2); // B
    }
  }
  return out;
}

export interface FitResult {
  /** CHW Float32 [-1,1] tensor, dst×dst, source fit top-left, background-padded. */
  tensor: Float32Array;
  /** Content box (≤ dst) the source maps into; the remainder is padding. */
  contentW: number;
  contentH: number;
  /** Uniform source→dst pixel scale (dst_px = src_px * scale). */
  scale: number;
}

/**
 * Aspect-PRESERVING fit of an RGBA image into a dst×dst, white-padded CHW [-1,1]
 * tensor. A plain resize-to-square squashes a non-square plan (e.g. 998×1418 → a
 * 30% distortion) AND loses the real-world scale; this instead fits the long side
 * to dst, pads the rest as background (white → +1), and returns the content box +
 * scale so the caller can crop the padding and correct mmPerPx by the downscale.
 * Pure + deterministic.
 */
export function fitNormalizeChw(image: RgbaImage, dst: number): FitResult {
  const { data, width: sw, height: sh } = image;
  const scale = dst / Math.max(sw, sh);
  const cw = Math.min(dst, Math.max(1, Math.round(sw * scale)));
  const ch = Math.min(dst, Math.max(1, Math.round(sh * scale)));
  const plane = dst * dst;
  const out = new Float32Array(3 * plane).fill(1); // white background → +1 in [-1,1]
  const sample = (sx: number, sy: number, c: number): number => {
    const xi = Math.min(sw - 1, Math.max(0, Math.round(sx)));
    const yi = Math.min(sh - 1, Math.max(0, Math.round(sy)));
    return 2 * ((data[(yi * sw + xi) * 4 + c] ?? 0) / 255) - 1;
  };
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = cw === sw ? x : (x / Math.max(1, cw - 1)) * (sw - 1);
      const sy = ch === sh ? y : (y / Math.max(1, ch - 1)) * (sh - 1);
      const p = y * dst + x;
      out[0 * plane + p] = sample(sx, sy, 0);
      out[1 * plane + p] = sample(sx, sy, 1);
      out[2 * plane + p] = sample(sx, sy, 2);
    }
  }
  return { tensor: out, contentW: cw, contentH: ch, scale };
}

/** Crop a dst×dst seg to its top-left content box, dropping the fit padding. */
function cropSeg(seg: CubicasaSeg, w: number, h: number): CubicasaSeg {
  if (w === seg.width && h === seg.height) return seg;
  const classMap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) classMap[y * w + x] = seg.classMap[y * seg.width + x] ?? 0;
  }
  return { width: w, height: h, classMap };
}

interface Onnx {
  InferenceSession: { create: (m: Uint8Array) => Promise<OnnxSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
}
interface OnnxSession {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
}

/** Lazily load onnxruntime-web as an OPTIONAL peer — never a hard build/runtime dep. */
async function loadOnnx(): Promise<Onnx | null> {
  // Try the Node runtime first (the sidecar runs inference), then web/WASM.
  // Opaque specifiers so neither vite nor tsc hard-requires these optional peers.
  for (const parts of [['onnxruntime', 'node'], ['onnxruntime', 'web']]) {
    try {
      const mod = (await import(/* @vite-ignore */ parts.join('-'))) as unknown as Onnx;
      if (mod?.InferenceSession) return mod;
    } catch {
      // try the next runtime
    }
  }
  return null;
}

/** True when onnxruntime-web is installed (the model is still supplied per call). */
export async function cubicasaRuntimeAvailable(): Promise<boolean> {
  return (await loadOnnx()) != null;
}

export interface CubicasaConfig {
  /** ONNX model bytes — the user-supplied CC-BY-NC weights (never bundled). */
  model: Uint8Array;
  /** The cropped/deskewed plan image (any size; resized internally). */
  image: RgbaImage;
  /** Scale + wall thresholds, shared with the heuristic CV path. */
  wall: RasterWallOptions;
}

/**
 * Run CubiCasa5k as a booster → PrimitivePlan. Returns null when onnxruntime-web
 * isn't installed (caller falls back to the heuristic pipeline). The exact tensor
 * names/output layout can vary by ONNX export — adjust here for your conversion.
 */
export async function runCubicasaBooster(cfg: CubicasaConfig): Promise<PrimitivePlan | null> {
  const ort = await loadOnnx();
  if (!ort) return null;
  try {
    const dst = CUBICASA_INPUT.width; // 512² square input
    // Aspect-preserving fit (not a square squash) so wall geometry isn't distorted.
    const fit = fitNormalizeChw(cfg.image, dst);
    const session = await ort.InferenceSession.create(cfg.model);
    const tensor = new ort.Tensor('float32', fit.tensor, [1, 3, dst, dst]);
    const out = await session.run({ [session.inputNames[0]!]: tensor });
    const logits = out[session.outputNames[0]!]!.data; // [44, H, W] (CHW): heatmaps + rooms + icons
    const seg = argmaxClassMap(
      logits,
      dst,
      dst,
      CUBICASA_INPUT.roomClasses,
      'CHW',
      CUBICASA_INPUT.roomOffset, // skip the 21 heatmap channels → the 12 room channels
      CUBICASA_INPUT.totalChannels,
    );
    // Drop the fit padding and correct mmPerPx by the downscale (each fitted pixel
    // spans 1/scale source pixels), so the plan comes out at the right real size.
    const cropped = cropSeg(seg, fit.contentW, fit.contentH);
    return cubicasaSegToPlan(cropped, { ...cfg.wall, mmPerPx: cfg.wall.mmPerPx / fit.scale });
  } catch {
    // Bad/unsupported model export or unexpected output shape → graceful fallback
    // to the heuristic pipeline rather than crashing the extraction.
    return null;
  }
}
