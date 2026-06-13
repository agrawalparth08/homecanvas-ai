/**
 * PrimitivePlan — the shared intermediate both front-doors emit (Phase 0).
 *
 * Every 2D→3D path (CAD/DXF, vector-PDF, raster-CV, manual trace) converts its
 * input into ONE typed bag of primitives, and a single `buildSceneFromPrimitives`
 * turns that into a validated `HomeScene`. This is the DRY seam the review locked
 * in (decision A2): no path builds a scene directly, so the builder, verify UI,
 * confidence ghosting, and tests are written once.
 *
 *   DXF ─┐
 *   PDF ─┼─►  PrimitivePlan  ─►  buildSceneFromPrimitives()  ─►  HomeScene
 *   IMG ─┘   (this file)          (build-scene.ts)
 *
 * Geometry is general from the start (D2 hybrid): walls are arbitrary segments
 * (a→b at any angle), room hints are rect OR polygon. The axis-aligned fast path
 * downstream consumes the rect/axis cases; the polygon fallback consumes the rest.
 *
 * Coordinates are in SOURCE units; `unitsToMm` scales to millimetres in the
 * builder. Keep this schema versioned — it is a persisted artifact.
 */
import { z } from 'zod';
import { Vec2Schema, OpeningKind, RoomKind } from '../scene/schemas';

/** Which extractor produced this plan — drives confidence + UI messaging. */
export const ProvenanceKind = z.enum(['cad', 'vector-pdf', 'raster-cv', 'traced', 'manual', 'sample']);
export type ProvenanceKind = z.infer<typeof ProvenanceKind>;

/** A wall as a free segment a→b (any angle). thickness/height optional → defaults applied in the builder. */
export const PrimWallSchema = z.object({
  a: Vec2Schema,
  b: Vec2Schema,
  thickness: z.number().positive().optional(),
  height: z.number().positive().optional(),
  /** source CAD layer / colour bucket, for provenance + the layer-confirm UI. */
  layer: z.string().optional(),
  role: z.enum(['wall', 'parapet', 'railing']).default('wall'),
});
export type PrimWall = z.infer<typeof PrimWallSchema>;

/** A door/window/opening positioned in world space; the builder snaps it to a host wall. */
export const PrimOpeningSchema = z.object({
  kind: OpeningKind,
  center: Vec2Schema,
  width: z.number().positive(),
  sillHeight: z.number().nonnegative().optional(),
  headHeight: z.number().positive().optional(),
  /** optional index into `walls` if the extractor already knows the host. */
  hostWallIndex: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type PrimOpening = z.infer<typeof PrimOpeningSchema>;

/** A structural column (magenta in plans / CAD COLUMN layer). */
export const PrimColumnSchema = z.object({
  center: Vec2Schema,
  width: z.number().positive(),
  depth: z.number().positive(),
});
export type PrimColumn = z.infer<typeof PrimColumnSchema>;

/** A staircase hint; flight params are filled with defaults downstream. */
export const PrimStairSchema = z.object({
  position: Vec2Schema,
  kind: z.enum(['straight', 'L', 'U']).default('straight'),
  rotation: z.number().default(0),
  width: z.number().positive().optional(),
});
export type PrimStair = z.infer<typeof PrimStairSchema>;

/**
 * A room hint — rect (axis fast-path) OR polygon (general/angled). At least one
 * is required. label/kind feed naming + furniture; openToSky marks terraces.
 */
export const PrimRoomHintSchema = z
  .object({
    rect: z.object({ x0: z.number().finite(), y0: z.number().finite(), x1: z.number().finite(), y1: z.number().finite() }).optional(),
    polygon: z.array(Vec2Schema).min(3).optional(),
    label: z.string().optional(),
    kind: RoomKind.optional(),
    openToSky: z.boolean().optional(),
  })
  .refine((r) => r.rect !== undefined || r.polygon !== undefined, {
    message: 'room hint requires a rect or a polygon',
  });
export type PrimRoomHint = z.infer<typeof PrimRoomHintSchema>;

/** An OCR'd text label (room name or dimension), in source coords. */
export const PrimLabelSchema = z.object({ text: z.string(), x: z.number().finite(), y: z.number().finite() });
export type PrimLabel = z.infer<typeof PrimLabelSchema>;

export const PrimBoundsSchema = z.object({
  x0: z.number().finite(),
  y0: z.number().finite(),
  x1: z.number().finite(),
  y1: z.number().finite(),
});
export type PrimBounds = z.infer<typeof PrimBoundsSchema>;

export const PrimitivePlanSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  /** mm per source unit (DXF $INSUNITS, calibration mm/px, etc.). */
  unitsToMm: z.number().positive().default(1),
  source: ProvenanceKind,
  walls: z.array(PrimWallSchema).default([]),
  openings: z.array(PrimOpeningSchema).default([]),
  columns: z.array(PrimColumnSchema).default([]),
  stairs: z.array(PrimStairSchema).default([]),
  roomHints: z.array(PrimRoomHintSchema).default([]),
  labels: z.array(PrimLabelSchema).default([]),
  bounds: PrimBoundsSchema.optional(),
  notes: z.string().optional(),
});
export type PrimitivePlan = z.infer<typeof PrimitivePlanSchema>;

/** Parse + validate untrusted primitive data (extractor output is never trusted). */
export function parsePrimitivePlan(input: unknown): PrimitivePlan {
  return PrimitivePlanSchema.parse(input);
}

/** Compute an axis-aligned bounds from all geometry, when an extractor didn't set one. */
export function computeBounds(plan: PrimitivePlan): PrimBounds | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const acc = (x: number, y: number) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const w of plan.walls) { acc(w.a.x, w.a.y); acc(w.b.x, w.b.y); }
  for (const h of plan.roomHints) {
    if (h.rect) { acc(h.rect.x0, h.rect.y0); acc(h.rect.x1, h.rect.y1); }
    if (h.polygon) for (const p of h.polygon) acc(p.x, p.y);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : undefined;
}
