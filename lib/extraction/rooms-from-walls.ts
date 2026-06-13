/**
 * Reconstruct rooms from a set of axis-aligned wall segments (Phase 3).
 *
 * Cell-decomposition: the distinct wall coordinates cut the plane into a grid of
 * cells; cells not separated by a wall belong to the same room; cells reachable
 * from outside (an open edge on the boundary) are exterior and dropped. Works on
 * walls from any source — CAD vector, DXF, or a raster wall-mask — so it is the
 * shared "walls → rooms" interpreter.
 */

export interface WallLine {
  orient: 'v' | 'h';
  coord: number;
  lo: number;
  hi: number;
}
export interface Rect { x0: number; y0: number; x1: number; y1: number; }

function uniqSorted(vals: number[], tol: number): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (out.length === 0 || v - out[out.length - 1]! > tol) out.push(v);
  return out;
}

export function detectRooms(walls: WallLine[], opts: { coordTol?: number; minArea?: number } = {}): Rect[] {
  const tol = opts.coordTol ?? 3;
  const minArea = opts.minArea ?? 0;
  const V = walls.filter((w) => w.orient === 'v');
  const H = walls.filter((w) => w.orient === 'h');

  const xs = uniqSorted([...V.map((w) => w.coord), ...H.flatMap((w) => [w.lo, w.hi])], tol);
  const ys = uniqSorted([...H.map((w) => w.coord), ...V.flatMap((w) => [w.lo, w.hi])], tol);
  const nx = xs.length - 1, ny = ys.length - 1;
  if (nx < 1 || ny < 1) return [];

  // A cell edge is blocked only if the walls at that coordinate cover ≥ COVER_FRAC
  // of the *whole* edge interval — not merely its midpoint. The old midpoint test
  // could wrongly open an edge whose centre fell in a gap between two collinear
  // wall segments (e.g. a door split), or wrongly block an edge a stray short wall
  // only touched at the middle. Coverage is the union of all near-coord segments.
  const COVER_FRAC = 0.5;
  const coverage = (lines: WallLine[], coord: number, a: number, b: number): number => {
    const ivs = lines
      .filter((w) => Math.abs(w.coord - coord) <= tol)
      .map((w) => [Math.max(w.lo, a), Math.min(w.hi, b)] as [number, number])
      .filter(([lo, hi]) => hi > lo)
      .sort((p, q) => p[0] - q[0]);
    let covered = 0, end = -Infinity;
    for (const [lo, hi] of ivs) {
      const s = Math.max(lo, end);
      if (hi > s) covered += hi - s;
      if (hi > end) end = hi;
    }
    return covered;
  };
  const vBlocks = (x: number, y0: number, y1: number) => coverage(V, x, y0, y1) >= (y1 - y0) * COVER_FRAC;
  const hBlocks = (y: number, x0: number, x1: number) => coverage(H, y, x0, x1) >= (x1 - x0) * COVER_FRAC;

  const N = nx * ny;
  const OUT = N;
  const parent = Array.from({ length: N + 1 }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const cell = (i: number, j: number) => j * nx + i;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = xs[i]!, x1 = xs[i + 1]!, y0 = ys[j]!, y1 = ys[j + 1]!;
      // right
      if (i + 1 < nx) { if (!vBlocks(x1, y0, y1)) union(cell(i, j), cell(i + 1, j)); }
      else if (!vBlocks(x1, y0, y1)) union(cell(i, j), OUT);
      // left (boundary only)
      if (i === 0 && !vBlocks(x0, y0, y1)) union(cell(i, j), OUT);
      // top
      if (j + 1 < ny) { if (!hBlocks(y1, x0, x1)) union(cell(i, j), cell(i, j + 1)); }
      else if (!hBlocks(y1, x0, x1)) union(cell(i, j), OUT);
      // bottom (boundary only)
      if (j === 0 && !hBlocks(y0, x0, x1)) union(cell(i, j), OUT);
    }
  }

  const comps = new Map<number, Rect>();
  const outRoot = find(OUT);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const r = find(cell(i, j));
      if (r === outRoot) continue;
      const b = comps.get(r) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      b.x0 = Math.min(b.x0, xs[i]!); b.x1 = Math.max(b.x1, xs[i + 1]!);
      b.y0 = Math.min(b.y0, ys[j]!); b.y1 = Math.max(b.y1, ys[j + 1]!);
      comps.set(r, b);
    }
  }
  return [...comps.values()]
    .filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) >= minArea)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
