/**
 * Best-effort auto-trace orchestrator (Phase 3).
 *
 * Chains the extraction pipeline: heal raw walls → detect rooms → score
 * confidence. Output is candidate geometry the user verifies/corrects in the
 * wizard (low-confidence on messy input, high on clean CAD/DXF). This is the
 * "optional auto-extraction" layer over the assisted-tracing floor.
 */
import { healWalls } from './heal-walls';
import { detectRooms, type Rect, type WallLine } from './rooms-from-walls';
import { scoreConfidence } from './confidence';
import { parseDxf } from '../ingestion/dxf';
import { parsePrimitivePlan, type PrimitivePlan } from './primitive-plan';
import { buildSceneFromPrimitives, type BuildSceneOptions } from './build-scene';
import type { HomeScene } from '../scene/schemas';

export interface RoomCandidate { rect: Rect; confidence: number; }
export interface AutoTraceResult {
  rooms: RoomCandidate[];
  wallCount: number;
  /** mm per source unit (1 for px/mm sources; from DXF $INSUNITS otherwise). */
  unitsToMm: number;
}

export function autoTraceFromWalls(
  walls: WallLine[],
  opts: { maxGap?: number; minArea?: number; unitsToMm?: number } = {},
): AutoTraceResult {
  const healed = healWalls(walls, { maxGap: opts.maxGap ?? 320 });
  const rects = detectRooms(healed, { coordTol: 10, minArea: opts.minArea ?? 0 });
  const rooms = rects.map((rect) => ({
    rect,
    confidence: scoreConfidence({ source: 'extracted', snappedToWall: true, fullyEnclosed: true }),
  }));
  return { rooms, wallCount: healed.length, unitsToMm: opts.unitsToMm ?? 1 };
}

/** Auto-trace straight from a DXF (clean layered walls → the reliable path). */
export function autoTraceDxf(dxfText: string, opts: { minArea?: number; maxGap?: number } = {}): AutoTraceResult {
  const plan = parseDxf(dxfText);
  return autoTraceFromWalls(plan.walls, { ...opts, unitsToMm: plan.unitsToMm });
}

/** Convert a parsed DXF into a PrimitivePlan (CAD provenance) — the shared spine's input. */
export function primitivePlanFromDxf(dxfText: string): PrimitivePlan {
  const plan = parseDxf(dxfText);
  const walls = plan.walls.map((w) => ({
    a: w.orient === 'v' ? { x: w.coord, y: w.lo } : { x: w.lo, y: w.coord },
    b: w.orient === 'v' ? { x: w.coord, y: w.hi } : { x: w.hi, y: w.coord },
  }));
  const labels = plan.labels.map((l) => ({ text: l.text, x: l.x, y: l.y }));
  return parsePrimitivePlan({ source: 'cad', unitsToMm: plan.unitsToMm, walls, labels });
}

/** Full DXF → validated HomeScene in one call (parse → PrimitivePlan → buildScene). */
export function autoTraceDxfToScene(dxfText: string, opts: BuildSceneOptions = {}): HomeScene {
  return buildSceneFromPrimitives(primitivePlanFromDxf(dxfText), opts);
}
