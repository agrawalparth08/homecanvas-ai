/**
 * Seal a CAD building perimeter before room detection (Phase 3).
 *
 * Real CAD plans break their outer walls at every door/window opening, so the
 * footprint is never actually closed. Cell-decomposition then lets big interior
 * rooms leak straight out through those gaps to the exterior and vanish (a
 * penthouse found only 4 of its rooms). The fix: compute the footprint bbox and
 * lay one *full-length* wall along each of its 4 edges, re-closing the perimeter
 * even where openings cut it. The interior gaps (interior divider doorways) are
 * left untouched — those cells now become real enclosed rooms instead of
 * escaping. The sealed wall set then feeds the shared detectRooms().
 */
import { detectRooms, type WallLine, type Rect } from './rooms-from-walls';

/** Axis-aligned footprint bounding box of every wall segment's extent. */
export function computeOutline(walls: WallLine[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of walls) {
    // a v-wall lives at x=coord spanning y∈[lo,hi]; an h-wall at y=coord spanning x∈[lo,hi]
    const wx0 = w.orient === 'v' ? w.coord : w.lo;
    const wx1 = w.orient === 'v' ? w.coord : w.hi;
    const wy0 = w.orient === 'v' ? w.lo : w.coord;
    const wy1 = w.orient === 'v' ? w.hi : w.coord;
    if (wx0 < x0) x0 = wx0;
    if (wx1 > x1) x1 = wx1;
    if (wy0 < y0) y0 = wy0;
    if (wy1 > y1) y1 = wy1;
  }
  return { x0, y0, x1, y1 };
}

/**
 * Detect rooms with the building perimeter forcibly sealed. Appends four
 * full-length WallLines on the footprint bbox edges so openings can no longer
 * leak interior rooms to the exterior, then delegates to detectRooms().
 */
export function detectRoomsSealed(walls: WallLine[], opts: { coordTol?: number; minArea?: number } = {}): Rect[] {
  if (walls.length === 0) return [];
  const { x0, y0, x1, y1 } = computeOutline(walls);
  if (!(x1 > x0) || !(y1 > y0)) return detectRooms(walls, opts);
  const seal: WallLine[] = [
    { orient: 'v', coord: x0, lo: y0, hi: y1 }, // left
    { orient: 'v', coord: x1, lo: y0, hi: y1 }, // right
    { orient: 'h', coord: y0, lo: x0, hi: x1 }, // bottom
    { orient: 'h', coord: y1, lo: x0, hi: x1 }, // top
  ];
  return detectRooms([...walls, ...seal], opts);
}
