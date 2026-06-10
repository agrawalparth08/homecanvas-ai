/**
 * Canonical units: all scene geometry is in MILLIMETERS, in plan space
 * (+x east, +y north). The renderer maps plan (x, y) -> three.js (x, -z),
 * elevation -> +y. All thresholds live here so they never depend on scale.
 */

/** Coordinate tolerance. Coordinates are snapped to this grid on commit. */
export const EPSILON_MM = 0.1;

/** Two plan points closer than this are the same junction. */
export const JUNCTION_SNAP_MM = 1;

/** Minimum solid wall stub left beside an opening after clamping. */
export const MIN_WALL_STUB_MM = 50;

/** Miter length clamp factor (× half-thickness) for very acute junctions. */
export const MITER_CLAMP_FACTOR = 4;

/** Indian masonry defaults: 4.5" partition / 9" external brick walls. */
export const DEFAULT_PARTITION_WALL_MM = 115;
export const DEFAULT_EXTERNAL_WALL_MM = 230;

export const DEFAULT_WALL_HEIGHT_MM = 3000;
export const DEFAULT_PARAPET_HEIGHT_MM = 1050;
export const DEFAULT_DOOR_WIDTH_MM = 900;
export const DEFAULT_DOOR_HEIGHT_MM = 2100;
export const DEFAULT_WINDOW_SILL_MM = 900;
export const DEFAULT_WINDOW_HEAD_MM = 2100;
export const DEFAULT_SLAB_THICKNESS_MM = 150;

/** Stairs (NBC-India-ish residential comfort range). */
export const STAIR_RISE_MIN_MM = 150;
export const STAIR_RISE_MAX_MM = 190;
export const STAIR_RISE_TARGET_MM = 172;
export const STAIR_TREAD_RUN_MM = 280;
export const STAIR_DEFAULT_WIDTH_MM = 1000;

/** Sanity bounds used by validation (all mm). */
export const WALL_THICKNESS_MIN_MM = 50;
export const WALL_THICKNESS_MAX_MM = 600;
export const WALL_HEIGHT_MIN_MM = 300; // parapets are walls too
export const WALL_HEIGHT_MAX_MM = 6000;
export const DOOR_WIDTH_MIN_MM = 550;
export const DOOR_WIDTH_MAX_MM = 2500;

export function snapMm(v: number): number {
  return Math.round(v / EPSILON_MM) * EPSILON_MM;
}
