/**
 * Vectorize a binary wall mask into axis-aligned centerlines (Path B no-CAD core).
 *
 * When the user has no CAD, the image pipeline yields a boolean WALL MASK
 * (mask[y][x] === true means wall pixel). detectRooms and the rest of the spine
 * speak WallLine (mm), so this is the pure mask → vectors step that lets the
 * raster path reuse the exact same downstream interpreter as the CAD path.
 *
 * A wall reads as a thin BAND of pixels: vertically, a stack of columns each
 * holding a long vertical run; horizontally, a stack of rows each holding a long
 * horizontal run. We collect maximal runs, cluster lengthwise-overlapping
 * neighbours across the thickness axis into a band (bounded width so a filled
 * region is NOT mistaken for a wall), bridge doorway gaps, and emit one
 * centerline per band in mm. No opencv, no DOM — plain data, deterministic.
 */
import { type WallLine } from './rooms-from-walls';

export interface RasterWallOptions {
  mmPerPx: number;            // scale (required)
  minWallPx?: number;         // min run length to count as a wall, default ~8
  minThicknessPx?: number;    // min projected thickness of a wall band, default ~2
  mergeGapPx?: number;        // bridge colinear gaps up to this many px, default ~3
}

/** A maximal run of wall pixels along one axis at a fixed cross-coordinate. */
interface Run { cross: number; lo: number; hi: number }

/** Cap a band's thickness so solid blobs are rejected, not read as fat walls. */
const MAX_BAND_PX = 40;

/** Round to ~0.1mm so coords are stable/comparable without float dust. */
const round01 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Maximal runs of `true` along the inner axis for each outer index.
 * `at(outer, inner)` reads the mask in whichever orientation the caller wants,
 * so one routine serves both vertical (scan columns) and horizontal (scan rows).
 */
function collectRuns(
  outerCount: number,
  innerCount: number,
  at: (outer: number, inner: number) => boolean,
  minLen: number,
): Run[] {
  const runs: Run[] = [];
  for (let o = 0; o < outerCount; o++) {
    let start = -1;
    for (let n = 0; n <= innerCount; n++) {
      const on = n < innerCount && at(o, n);
      if (on && start < 0) start = n;
      else if (!on && start >= 0) {
        // run spans pixels [start, n-1] → geometric extent [start, n]
        if (n - start >= minLen) runs.push({ cross: o, lo: start, hi: n });
        start = -1;
      }
    }
  }
  return runs;
}

/**
 * Cluster runs into bands and emit one centerline each.
 * Runs join a band when their cross-coords are adjacent (within one column/row)
 * AND they overlap lengthwise — that is the wall's thin profile. A band whose
 * width exceeds MAX_BAND_PX is a filled region, not a wall, so it is dropped.
 */
function bandsToWalls(
  runs: Run[],
  orient: WallLine['orient'],
  mmPerPx: number,
  minThicknessPx: number,
  mergeGapPx: number,
): WallLine[] {
  if (runs.length === 0) return [];
  // group by cross-coord so we can walk thickness in order
  const byCross = new Map<number, Run[]>();
  for (const r of runs) {
    const list = byCross.get(r.cross);
    if (list) list.push(r);
    else byCross.set(r.cross, [r]);
  }
  const crosses = [...byCross.keys()].sort((a, b) => a - b);

  // union-find over run indices; only lengthwise-overlapping runs in adjacent
  // columns/rows merge, so two distinct parallel walls never bleed together.
  const parent = runs.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const idxOf = new Map<Run, number>();
  runs.forEach((r, i) => idxOf.set(r, i));

  for (let ci = 0; ci + 1 < crosses.length; ci++) {
    const c = crosses[ci]!;
    const nextC = crosses[ci + 1]!;
    if (nextC - c !== 1) continue; // bands are pixel-contiguous in thickness
    const a = byCross.get(c)!;
    const b = byCross.get(nextC)!;
    for (const ra of a) {
      for (const rb of b) {
        if (Math.min(ra.hi, rb.hi) > Math.max(ra.lo, rb.lo)) {
          union(idxOf.get(ra)!, idxOf.get(rb)!);
        }
      }
    }
  }

  const groups = new Map<number, Run[]>();
  for (const r of runs) {
    const root = find(idxOf.get(r)!);
    const list = groups.get(root);
    if (list) list.push(r);
    else groups.set(root, [r]);
  }

  const out: WallLine[] = [];
  for (const band of groups.values()) {
    let minCross = Infinity, maxCross = -Infinity, sumCross = 0;
    let lo = Infinity, hi = -Infinity;
    for (const r of band) {
      minCross = Math.min(minCross, r.cross);
      maxCross = Math.max(maxCross, r.cross);
      sumCross += r.cross;
      lo = Math.min(lo, r.lo);
      hi = Math.max(hi, r.hi);
    }
    const widthPx = maxCross - minCross + 1; // inclusive pixel count
    if (widthPx < minThicknessPx) continue;  // too thin to be a real band
    if (widthPx > MAX_BAND_PX) continue;      // too fat → a filled region, not a wall
    // centerline at the mean column/row centre (+0.5 → pixel-centre in geometry)
    const coordPx = sumCross / band.length + 0.5;
    out.push({
      orient,
      coord: round01(coordPx * mmPerPx),
      lo: round01(lo * mmPerPx),
      hi: round01(hi * mmPerPx),
    });
  }

  return bridgeGaps(out, mergeGapPx * mmPerPx);
}

/**
 * Bridge colinear segments (same orient, near-equal coord) whose endpoints sit
 * within `gapMm` — doorways and stray mask breaks — into one continuous span.
 */
function bridgeGaps(walls: WallLine[], gapMm: number): WallLine[] {
  if (walls.length <= 1) return walls;
  // collinear if coord matches within a pixel of slack (post-rounding dust)
  const coordTol = 0.6;
  const sorted = [...walls].sort((a, b) => a.coord - b.coord || a.lo - b.lo);
  const out: WallLine[] = [];
  for (const w of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.coord - w.coord) <= coordTol && w.lo - prev.hi <= gapMm) {
      prev.hi = Math.max(prev.hi, w.hi);
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

/** mask[y][x] === true means wall. Returns axis-aligned centerlines in MM. */
export function wallsFromMask(mask: boolean[][], opts: RasterWallOptions): WallLine[] {
  const mmPerPx = opts.mmPerPx;
  const minWallPx = opts.minWallPx ?? 8;
  const minThicknessPx = opts.minThicknessPx ?? 2;
  const mergeGapPx = opts.mergeGapPx ?? 3;

  const height = mask.length;
  const width = height > 0 ? (mask[0]?.length ?? 0) : 0;
  if (width === 0 || height === 0) return [];

  const px = (y: number, x: number): boolean => mask[y]?.[x] === true;

  // Vertical walls: scan columns (outer = x), runs along y.
  const vRuns = collectRuns(width, height, (x, y) => px(y, x), minWallPx);
  const vWalls = bandsToWalls(vRuns, 'v', mmPerPx, minThicknessPx, mergeGapPx);

  // Horizontal walls: scan rows (outer = y), runs along x.
  const hRuns = collectRuns(height, width, (y, x) => px(y, x), minWallPx);
  const hWalls = bandsToWalls(hRuns, 'h', mmPerPx, minThicknessPx, mergeGapPx);

  return [...vWalls, ...hWalls];
}
