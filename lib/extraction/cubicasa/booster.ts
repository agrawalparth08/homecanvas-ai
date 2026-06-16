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
import { argmaxClassMap, cubicasaSegToPlan } from './masks-to-plan';
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
 * Bilinear-resize an RGBA image to dst×dst and normalize to a CHW Float32 tensor
 * in [0,1] (3 channels, alpha dropped). Pure + deterministic — the model-input
 * prep, testable without onnxruntime.
 */
export function resizeNormalizeChw(image: RgbaImage, dstW: number, dstH: number): Float32Array {
  const { data, width: sw, height: sh } = image;
  const out = new Float32Array(3 * dstW * dstH);
  const sampleAt = (sx: number, sy: number, ch: number): number => {
    const xi = Math.min(sw - 1, Math.max(0, Math.round(sx)));
    const yi = Math.min(sh - 1, Math.max(0, Math.round(sy)));
    return (data[(yi * sw + xi) * 4 + ch] ?? 0) / 255;
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
    const input = resizeNormalizeChw(cfg.image, CUBICASA_INPUT.width, CUBICASA_INPUT.height);
    const session = await ort.InferenceSession.create(cfg.model);
    const tensor = new ort.Tensor('float32', input, [1, 3, CUBICASA_INPUT.height, CUBICASA_INPUT.width]);
    const out = await session.run({ [session.inputNames[0]!]: tensor });
    const logits = out[session.outputNames[0]!]!.data; // [44, H, W] (CHW): heatmaps + rooms + icons
    const seg = argmaxClassMap(
      logits,
      CUBICASA_INPUT.width,
      CUBICASA_INPUT.height,
      CUBICASA_INPUT.roomClasses,
      'CHW',
      CUBICASA_INPUT.roomOffset, // skip the 21 heatmap channels → the 12 room channels
      CUBICASA_INPUT.totalChannels,
    );
    return cubicasaSegToPlan(seg, cfg.wall);
  } catch {
    // Bad/unsupported model export or unexpected output shape → graceful fallback
    // to the heuristic pipeline rather than crashing the extraction.
    return null;
  }
}
