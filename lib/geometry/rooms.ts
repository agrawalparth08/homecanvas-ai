import { dist, type Vec2 } from './vec';

/** Polygon utilities for room boundaries (plan mm). */

export function signedArea(poly: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function polygonArea(poly: Vec2[]): number {
  return Math.abs(signedArea(poly));
}

export function centroid(poly: Vec2[]): Vec2 {
  const area = signedArea(poly);
  if (Math.abs(area) < 1e-9) {
    const sum = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / poly.length, y: sum.y / poly.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export interface RoomBoundary {
  outer: Vec2[];
  holes: Vec2[][];
}

/**
 * Sanitize a boundary before triangulation (earcut silently degenerates on
 * malformed input): dedupe consecutive points, enforce winding — outer CCW,
 * holes CW (three.js Shape convention).
 */
export function sanitizeBoundary(boundary: RoomBoundary): RoomBoundary {
  const clean = (poly: Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const p of poly) {
      const last = out[out.length - 1];
      if (!last || dist(last, p) > 0.5) out.push({ x: p.x, y: p.y });
    }
    while (out.length > 1 && dist(out[0]!, out[out.length - 1]!) <= 0.5) out.pop();
    return out;
  };

  const ensure = (poly: Vec2[], ccw: boolean): Vec2[] => {
    const isCcw = signedArea(poly) > 0;
    return isCcw === ccw ? poly : [...poly].reverse();
  };

  const outer = ensure(clean(boundary.outer), true);
  const holes = boundary.holes
    .map((h) => clean(h))
    .filter((h) => h.length >= 3)
    .map((h) => ensure(h, false));
  return { outer, holes };
}
