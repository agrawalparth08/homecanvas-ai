/**
 * Collapse double-line CAD walls into single centerlines (Path A refinement).
 *
 * Architectural CAD draws every wall as TWO parallel lines (its inner + outer
 * face). Fed raw into detectRooms, the thin gap between the faces becomes its
 * own sliver "room", so a real ~18-room plan explodes into 60+ phantom cells.
 *
 * This pairs each axis-aligned wall segment with the nearest parallel segment
 * that (a) sits within `maxThickness` and (b) overlaps it lengthwise, then
 * replaces the pair with ONE centerline carrying the measured thickness.
 * Unpaired segments (genuine single-line walls) keep a default thickness.
 *
 *   ║   ║   two faces, gap 115mm        │   one centerline, thickness 115mm
 *   ║   ║   spanning the same run   →    │
 */
import type { WallLine } from './rooms-from-walls';

export interface CenterWall extends WallLine {
  /** measured face-to-face thickness (mm) for paired walls; default otherwise. */
  thickness: number;
}

export interface CollapseOptions {
  /** max face-to-face gap to treat two parallels as one wall (mm). */
  maxThickness?: number;
  /** thickness assigned to unpaired single-line walls (mm). */
  defaultThickness?: number;
  /** required lengthwise overlap as a fraction of the shorter segment. */
  minOverlapFrac?: number;
}

export function collapseDoubleWalls(walls: WallLine[], opts: CollapseOptions = {}): CenterWall[] {
  const maxT = opts.maxThickness ?? 350;
  const defT = opts.defaultThickness ?? 115;
  const minOv = opts.minOverlapFrac ?? 0.4;
  const out: CenterWall[] = [];

  for (const orient of ['v', 'h'] as const) {
    const g = walls.filter((w) => w.orient === orient);
    const used = new Array(g.length).fill(false);
    // scan in coord order so "nearest parallel" is a forward window we can break out of
    const order = g.map((_, i) => i).sort((a, b) => g[a]!.coord - g[b]!.coord);

    for (let ii = 0; ii < order.length; ii++) {
      const i = order[ii]!;
      if (used[i]) continue;
      const wi = g[i]!;
      let best = -1;
      let bestGap = Infinity;
      for (let jj = ii + 1; jj < order.length; jj++) {
        const j = order[jj]!;
        if (used[j]) continue;
        const wj = g[j]!;
        const gap = wj.coord - wi.coord;
        if (gap > maxT) break; // sorted: nothing further can pair
        const overlap = Math.min(wi.hi, wj.hi) - Math.max(wi.lo, wj.lo);
        const shorter = Math.min(wi.hi - wi.lo, wj.hi - wj.lo);
        if (overlap > 0 && overlap >= shorter * minOv && gap < bestGap) {
          best = j;
          bestGap = gap;
        }
      }
      if (best >= 0) {
        const wj = g[best]!;
        used[i] = true;
        used[best] = true;
        out.push({
          orient,
          coord: (wi.coord + wj.coord) / 2,
          lo: Math.min(wi.lo, wj.lo),
          hi: Math.max(wi.hi, wj.hi),
          thickness: Math.max(40, wj.coord - wi.coord),
        });
      } else {
        used[i] = true;
        out.push({ orient, coord: wi.coord, lo: wi.lo, hi: wi.hi, thickness: defT });
      }
    }
  }
  return out;
}
