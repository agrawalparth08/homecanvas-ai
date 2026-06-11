/**
 * Heal a raw set of axis-aligned wall segments so they enclose rooms (Phase 3).
 * Real plans break walls at door/window openings and leave endpoints short of
 * junctions, which makes cell-decomposition leak. Healing:
 *   1. merge collinear segments across small gaps (bridge openings),
 *   2. snap each segment's endpoints onto the perpendicular wall lines so walls
 *      actually meet at corners.
 * The output feeds detectRooms().
 */
import type { WallLine } from './rooms-from-walls';

function clusterReps(values: number[], tol: number): Map<number, number> {
  const s = [...new Set(values)].sort((a, b) => a - b);
  const reps = new Map<number, number>();
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1]! - s[i]! <= tol) j++;
    const rep = Math.round(s.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1));
    for (let k = i; k <= j; k++) reps.set(s[k]!, rep);
    i = j + 1;
  }
  return reps;
}

/** Merge collinear segments (same orientation + clustered coordinate) across gaps ≤ maxGap. */
export function mergeCollinearWalls(walls: WallLine[], maxGap = 320, coordTol = 12): WallLine[] {
  const out: WallLine[] = [];
  for (const orient of ['v', 'h'] as const) {
    const lines = walls.filter((w) => w.orient === orient);
    if (lines.length === 0) continue;
    const reps = clusterReps(lines.map((w) => w.coord), coordTol);
    const byRep = new Map<number, WallLine[]>();
    for (const w of lines) {
      const r = reps.get(w.coord)!;
      (byRep.get(r) ?? byRep.set(r, []).get(r)!).push({ ...w, coord: r });
    }
    for (const [coord, group] of byRep) {
      group.sort((a, b) => a.lo - b.lo);
      let cur: WallLine = { orient, coord, lo: group[0]!.lo, hi: group[0]!.hi };
      for (let k = 1; k < group.length; k++) {
        const g = group[k]!;
        if (g.lo <= cur.hi + maxGap) cur.hi = Math.max(cur.hi, g.hi);
        else { out.push(cur); cur = { orient, coord, lo: g.lo, hi: g.hi }; }
      }
      out.push(cur);
    }
  }
  return out;
}

/** Snap each segment's endpoints onto the nearest perpendicular wall line (junctions). */
export function snapEndpointsToGrid(walls: WallLine[], tol = 16): WallLine[] {
  const vCoords = [...new Set(walls.filter((w) => w.orient === 'v').map((w) => w.coord))];
  const hCoords = [...new Set(walls.filter((w) => w.orient === 'h').map((w) => w.coord))];
  const snap = (v: number, set: number[]) => {
    let best = v, bd = tol;
    for (const c of set) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  return walls.map((w) =>
    w.orient === 'v'
      ? { ...w, lo: snap(w.lo, hCoords), hi: snap(w.hi, hCoords) }
      : { ...w, lo: snap(w.lo, vCoords), hi: snap(w.hi, vCoords) },
  );
}

/** Bridge openings + snap junctions in one call. */
export function healWalls(walls: WallLine[], opts: { maxGap?: number; coordTol?: number; snapTol?: number } = {}): WallLine[] {
  const merged = mergeCollinearWalls(walls, opts.maxGap ?? 320, opts.coordTol ?? 12);
  return snapEndpointsToGrid(merged, opts.snapTol ?? 16);
}
