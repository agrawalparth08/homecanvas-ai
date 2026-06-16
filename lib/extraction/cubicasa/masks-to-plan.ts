/**
 * CubiCasa5k segmentation → PrimitivePlan (the model-output side of the optional
 * booster). PURE + deterministic: turns the model's per-pixel room-class map into
 * a binary WALL mask and routes it through the SAME `primitivePlanFromMask` /
 * `wallsFromMask` path the heuristic CV pipeline uses — so a CubiCasa-boosted
 * extraction joins the identical `buildSceneFromPrimitives` spine, no bespoke
 * assembly. No model/onnx here — those live in ./booster (optional, gated).
 *
 * CubiCasa5k is CC-BY-NC: this code is generic mask plumbing (always present);
 * the model weights it consumes are personal-use-only and user-supplied.
 */
import { primitivePlanFromMask } from '../raster-to-plan';
import type { RasterWallOptions } from '../raster-walls';
import type { PrimitivePlan } from '../primitive-plan';

/** CubiCasa5k 'rooms' head classes; index 2 is Wall — the only one geometry needs. */
export const CUBICASA_ROOM_CLASSES = [
  'Background',
  'Outdoor',
  'Wall',
  'Kitchen',
  'Living Room',
  'Bedroom',
  'Bath',
  'Hallway',
  'Railing',
  'Storage',
  'Garage',
  'Undefined',
] as const;
export const CUBICASA_WALL_CLASS = 2;

export interface CubicasaSeg {
  width: number;
  height: number;
  /** Per-pixel room-class index, row-major (length === width*height). */
  classMap: Uint8Array | number[];
}

/**
 * Argmax a raw room-head tensor (logits or probabilities) to a class map.
 * `layout` is 'CHW' (channel-major, the usual ONNX NCHW minus batch) or 'HWC'.
 */
export function argmaxClassMap(
  logits: Float32Array | number[],
  width: number,
  height: number,
  classes: number,
  layout: 'CHW' | 'HWC' = 'CHW',
  /** Channel index of class 0 — lets you argmax a SLICE of a wider tensor (the
   *  real CubiCasa head is 44 ch = 21 heatmaps + 12 rooms@21 + 11 icons). */
  channelOffset = 0,
  /** Total channels per pixel, for HWC striding (defaults to `classes`). */
  totalChannels: number = classes,
): CubicasaSeg {
  const n = width * height;
  const classMap = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bestV = -Infinity;
    for (let c = 0; c < classes; c++) {
      const idx = layout === 'CHW' ? (channelOffset + c) * n + i : i * totalChannels + channelOffset + c;
      const v = logits[idx] ?? -Infinity;
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    classMap[i] = best;
  }
  return { width, height, classMap };
}

/** Binary wall mask from a CubiCasa class map; mask[y][x] === true marks a wall pixel. */
export function wallMaskFromSeg(seg: CubicasaSeg, wallClass: number = CUBICASA_WALL_CLASS): boolean[][] {
  const { width, height, classMap } = seg;
  const mask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row = new Array<boolean>(width);
    for (let x = 0; x < width; x++) row[x] = classMap[y * width + x] === wallClass;
    mask.push(row);
  }
  return mask;
}

/** CubiCasa room segmentation → a validated `raster-cv` PrimitivePlan. Pure. */
export function cubicasaSegToPlan(seg: CubicasaSeg, opts: RasterWallOptions): PrimitivePlan {
  return primitivePlanFromMask(wallMaskFromSeg(seg), opts);
}
