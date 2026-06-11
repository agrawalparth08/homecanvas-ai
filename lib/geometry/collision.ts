/**
 * Furniture collision + clearance (Phase 5), plan-space mm, pure.
 *
 * Footprints are convex polygons in local space (origin at the object's
 * transform). We test overlap with the Separating Axis Theorem over BOTH polys'
 * edge normals — which handles rotated rectangles (OBBs) and any convex shape on
 * one code path. Room containment and door-swing clearance reuse the same
 * primitive. No three.js, no scene coupling: polygons in, booleans out.
 */
import { dot, normalize, perp, rotate, sub, type Vec2 } from './vec';
import { pointInPolygon } from './rooms';

/** Outward edge normals of a polygon (assumed convex), unit length. */
function edgeNormals(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const e = sub(b, a);
    if (e.x === 0 && e.y === 0) continue;
    out.push(normalize(perp(e)));
  }
  return out;
}

function project(poly: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = dot(p, axis);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/**
 * True if convex polygons A and B overlap (or are within `gap` of each other).
 * A positive gap enforces a minimum clearance. NOTE: at gap=0 exactly-touching
 * edges (shared boundary, zero interior overlap) report FALSE — flush placement
 * is permitted. Pass a small positive gap if touching should count as a clash.
 * Inputs MUST be convex (SAT assumption); see swingSector for the caveat there.
 */
export function convexOverlap(a: Vec2[], b: Vec2[], gap = 0): boolean {
  for (const axis of [...edgeNormals(a), ...edgeNormals(b)]) {
    const pa = project(a, axis);
    const pb = project(b, axis);
    // separating axis: a gap on any axis means no collision
    if (pa.max + gap <= pb.min || pb.max + gap <= pa.min) return false;
  }
  return true;
}

/** Lift a local footprint into world space by the object's rotation + position. */
export function worldFootprint(obj: {
  footprint: Vec2[];
  transform: { x: number; y: number; rotationY: number };
}): Vec2[] {
  const { x, y, rotationY } = obj.transform;
  return obj.footprint.map((p) => {
    const r = rotate(p, rotationY);
    return { x: r.x + x, y: r.y + y };
  });
}

/** Axis-aligned rectangle footprint centred on the local origin. */
export function rectFootprint(w: number, d: number): Vec2[] {
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
}

/** Every vertex of `inner` lies inside `outer` (used for room containment). */
export function polygonContains(outer: Vec2[], inner: Vec2[]): boolean {
  return inner.every((p) => pointInPolygon(p, outer));
}

/** Does a candidate object collide with any of the others (with optional gap)? */
export function collidesWithAny(
  candidate: Vec2[],
  others: Vec2[][],
  gap = 0,
): boolean {
  return others.some((o) => convexOverlap(candidate, o, gap));
}

/**
 * Sector ("pie slice") approximating a door swing as a fan polygon. `hinge` is
 * the hinge point; the arc sweeps `sweep` rad from `startAngle`. Furniture whose
 * footprint overlaps this should be flagged (v1: warn).
 *
 * IMPORTANT: the result is only CONVEX for sweep ≤ π — a reflex vertex appears
 * at the hinge beyond that, which would make convexOverlap (SAT) give wrong
 * answers. Real door swings are ≤ π; callers must not exceed it (or must split
 * a >π sweep into convex sub-sectors and test each).
 */
export function swingSector(
  hinge: Vec2,
  radius: number,
  startAngle: number,
  sweep: number,
  segments = 6,
): Vec2[] {
  const pts: Vec2[] = [hinge];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (sweep * i) / segments;
    pts.push({ x: hinge.x + radius * Math.cos(a), y: hinge.y + radius * Math.sin(a) });
  }
  return pts;
}

export interface PlacementResult {
  x: number;
  y: number;
  rotationY: number;
}

/**
 * Deterministic search for a spot inside `roomOuter` where a w×d footprint fits
 * without overlapping any obstacle (respecting `gap`). Scans a coarse grid in
 * reading order, trying axis-aligned then 90°-rotated; returns the first fit or
 * null. Same inputs => same answer (no randomness).
 */
export function findPlacement(
  roomOuter: Vec2[],
  w: number,
  d: number,
  obstacles: Vec2[][],
  opts: { gap?: number; margin?: number; step?: number } = {},
): PlacementResult | null {
  const gap = opts.gap ?? 150;
  const margin = opts.margin ?? 100;
  const step = opts.step ?? Math.max(300, Math.min(w, d) / 2);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of roomOuter) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  for (let y = minY + margin; y <= maxY - margin; y += step) {
    for (let x = minX + margin; x <= maxX - margin; x += step) {
      for (const rotationY of [0, Math.PI / 2]) {
        const foot = worldFootprint({ footprint: rectFootprint(w, d), transform: { x, y, rotationY } });
        if (!polygonContains(roomOuter, foot)) continue;
        if (collidesWithAny(foot, obstacles, gap)) continue;
        return { x, y, rotationY };
      }
    }
  }
  return null;
}
