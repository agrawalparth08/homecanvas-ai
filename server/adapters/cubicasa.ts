/**
 * Sidecar side of the optional CubiCasa5k booster. Reads the (gitignored,
 * user-converted) ONNX model from asset-cache and runs the booster over raw RGBA
 * pixels sent by the client. Everything is graceful: if the model file or the
 * onnxruntime runtime is missing, this reports unavailable and the client falls
 * back to the heuristic CV pipeline. See lib/extraction/cubicasa/README.md.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ASSET_CACHE } from '../storage';
import { cubicasaRuntimeAvailable, runCubicasaBooster } from '../../lib/extraction/cubicasa/booster';
import type { PrimitivePlan } from '../../lib/extraction/primitive-plan';

const MODEL_PATH = path.join(ASSET_CACHE, 'models', 'cubicasa5k.onnx');

export function cubicasaModelPresent(): boolean {
  return existsSync(MODEL_PATH);
}

/** Available only when BOTH the converted model and the onnxruntime peer are present. */
export async function cubicasaAvailable(): Promise<boolean> {
  return cubicasaModelPresent() && (await cubicasaRuntimeAvailable());
}

/** Run CubiCasa over raw RGBA pixels → PrimitivePlan, or null if unavailable/failed. */
export async function runCubicasaSidecar(
  rgba: Uint8Array,
  width: number,
  height: number,
  mmPerPx: number,
): Promise<PrimitivePlan | null> {
  if (!cubicasaModelPresent()) return null;
  const model = new Uint8Array(await readFile(MODEL_PATH));
  return runCubicasaBooster({ model, image: { data: rgba, width, height }, wall: { mmPerPx } });
}
