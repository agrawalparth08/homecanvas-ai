/**
 * Pure drag math for placing furniture (Phase 6+). No three.js import: the R3F
 * wiring (camera → ray) is done by the main session and hands us plain numbers.
 *
 * Convention: three.js world is right-handed with +Y up, so the floor is the
 * horizontal plane y = floorY and plan coordinates map as plan.x = world.x,
 * plan.y = world.z (the depth axis). All distances are mm to match the scene
 * graph; rooms and footprints are plan-space (see collision.ts).
 */
import type { Vec2 } from '../geometry/vec';
import { rectFootprint, worldFootprint, collidesWithAny } from '../geometry/collision';

/** Local 3D vector type (we deliberately do not depend on three.js Vector3). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Plan-space size of a piece (footprint width × depth, mm). */
export interface Size2 {
  w: number;
  d: number;
}

/** A placed obstacle in plan space: centre, size and yaw rotation. */
export interface PlacedRect {
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
}

/** Axis-aligned room bounds in plan space (x0,y0 = min corner). */
export interface RoomBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Intersect a pointer ray with the horizontal floor plane y = floorY and return
 * the hit as plan coords {x: world.x, y: world.z}. Returns null when the ray is
 * parallel to the floor or points away from it (no forward hit).
 */
export function screenToFloor(
  rayOrigin: Vec3,
  rayDir: Vec3,
  floorY: number,
): Vec2 | null {
  const denom = rayDir.y;
  if (denom === 0) return null; // parallel to the floor
  const t = (floorY - rayOrigin.y) / denom;
  if (!(t > 0) || !Number.isFinite(t)) return null; // behind the camera / degenerate
  return { x: rayOrigin.x + rayDir.x * t, y: rayOrigin.z + rayDir.z * t };
}

/** Half-extents that keep an axis-aligned w×d centre inside the bounds. */
function clampCentre(target: Vec2, size: Size2, b: RoomBounds): Vec2 {
  const hw = size.w / 2;
  const hd = size.d / 2;
  // If the piece is wider than the room on an axis, centre it on that axis.
  const x = b.x1 - b.x0 <= size.w ? (b.x0 + b.x1) / 2 : clamp(target.x, b.x0 + hw, b.x1 - hw);
  const y = b.y1 - b.y0 <= size.d ? (b.y0 + b.y1) / 2 : clamp(target.y, b.y0 + hd, b.y1 - hd);
  return { x, y };
}

/**
 * Snap a dragged target to a legal resting spot: first clamp the centre so the
 * axis-aligned w×d footprint stays inside `roomBounds`, then, if it still
 * overlaps any `others`, spiral outward on a coarse grid for the nearest clear
 * (and still in-bounds) centre. Returns the clamped target unchanged when it is
 * already clear. Deterministic — same inputs, same output.
 */
export function dragSnap(
  target: Vec2,
  size: Size2,
  others: PlacedRect[],
  roomBounds: RoomBounds,
  opts: { gap?: number; step?: number } = {},
): Vec2 {
  const gap = opts.gap ?? 0;
  const base = clampCentre(target, size, roomBounds);

  const obstacles = others.map((o) =>
    worldFootprint({
      footprint: rectFootprint(o.w, o.d),
      transform: { x: o.x, y: o.y, rotationY: o.rot },
    }),
  );
  const footAt = (c: Vec2) => rectFootprint(size.w, size.d).map((p) => ({ x: p.x + c.x, y: p.y + c.y }));

  if (!collidesWithAny(footAt(base), obstacles, gap)) return base;

  // Spiral search on a ring grid for the nearest non-overlapping in-bounds spot.
  const step = opts.step ?? Math.max(100, Math.min(size.w, size.d) / 2);
  const maxRings = 32;
  for (let ring = 1; ring <= maxRings; ring++) {
    let best: Vec2 | null = null;
    let bestDist = Infinity;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // ring perimeter only
        const c = clampCentre({ x: base.x + dx * step, y: base.y + dy * step }, size, roomBounds);
        if (collidesWithAny(footAt(c), obstacles, gap)) continue;
        const dist = (c.x - base.x) ** 2 + (c.y - base.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
    }
    if (best) return best;
  }
  return base; // nowhere clear fits; keep it in-bounds at least
}
