import { dist, type Vec2 } from '../geometry/vec';

/** Snap a plan-mm point to a regular grid. */
export function snapToGrid(p: Vec2, gridMm: number): Vec2 {
  if (gridMm <= 0) return p;
  return { x: Math.round(p.x / gridMm) * gridMm, y: Math.round(p.y / gridMm) * gridMm };
}

/** Nearest of `points` within `tolMm`, else null. */
export function snapToPoints(p: Vec2, points: Vec2[], tolMm: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tolMm;
  for (const q of points) {
    const d = dist(p, q);
    if (d <= bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Snap to existing geometry first (within tol), otherwise to the grid. */
export function snapPoint(p: Vec2, anchors: Vec2[], gridMm: number, tolMm: number): Vec2 {
  return snapToPoints(p, anchors, tolMm) ?? snapToGrid(p, gridMm);
}

/** Optionally constrain b to a horizontal/vertical line from a (axis lock). */
export function axisLock(a: Vec2, b: Vec2): Vec2 {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}
