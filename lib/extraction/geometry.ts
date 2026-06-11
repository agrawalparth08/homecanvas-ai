/**
 * Pure geometry helpers for plan extraction (Phase 3).
 *
 * These are the algorithmic core shared by the CAD-vector extraction scripts
 * (scripts/trace/*) and the scene generator: clustering wall lines, snapping
 * traced edges onto real walls, merging pillar boxes, and matching a window
 * marking to the wall it belongs on. Kept free of any PDF/IO so they unit-test
 * deterministically.
 */

export interface LenLine {
  /** coordinate of the line (px or mm). */
  coord: number;
  /** length contributed at this coordinate (for weighting). */
  len: number;
}

/** Length-weighted 1-D clustering → representative coordinate per cluster. */
export function clusterLines(lines: LenLine[], tol = 4, minTotalLen = 60): number[] {
  const byCoord = new Map<number, number>();
  for (const l of lines) {
    const c = Math.round(l.coord);
    byCoord.set(c, (byCoord.get(c) ?? 0) + l.len);
  }
  const coords = [...byCoord.keys()].sort((a, b) => a - b);
  const clusters: { sum: number; w: number; len: number; max: number }[] = [];
  for (const c of coords) {
    const last = clusters[clusters.length - 1];
    const wgt = byCoord.get(c)!;
    if (last && c - last.max <= tol) {
      last.sum += wgt * c; last.w += wgt; last.len += wgt; last.max = c;
    } else {
      clusters.push({ sum: wgt * c, w: wgt, len: wgt, max: c });
    }
  }
  return clusters.filter((c) => c.len >= minTotalLen).map((c) => Math.round(c.sum / c.w)).sort((a, b) => a - b);
}

/** Snap a value to the nearest line within tol; otherwise return it unchanged. */
export function snapValue(v: number, lines: number[], tol: number): number {
  let best = v, bestD = tol;
  for (const g of lines) {
    const d = Math.abs(g - v);
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

/**
 * Collapse a set of edge values so any within `tol` of each other become one
 * shared value (removes sub-wall slivers that would create degenerate walls).
 * Returns a map old→new.
 */
export function quantize(values: number[], tol: number): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const map = new Map<number, number>();
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]! - sorted[i]! <= tol) j++;
    const rep = Math.round(sorted.slice(i, j + 1).reduce((s, v) => s + v, 0) / (j - i + 1));
    for (let k = i; k <= j; k++) map.set(sorted[k]!, rep);
    i = j + 1;
  }
  return map;
}

export interface Box { x0: number; y0: number; x1: number; y1: number; }

/** Merge boxes whose bounds are within `gap` into their union (pillar grouping). */
export function mergeBoxes(boxes: Box[], gap: number): Box[] {
  const near = (a: Box, b: Box) => a.x0 <= b.x1 + gap && b.x0 <= a.x1 + gap && a.y0 <= b.y1 + gap && b.y0 <= a.y1 + gap;
  const used = new Array(boxes.length).fill(false);
  const out: Box[] = [];
  for (let i = 0; i < boxes.length; i++) {
    if (used[i]) continue;
    const g: Box = { ...boxes[i]! };
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < boxes.length; j++) {
        if (used[j]) continue;
        if (near(g, boxes[j]!)) {
          g.x0 = Math.min(g.x0, boxes[j]!.x0); g.y0 = Math.min(g.y0, boxes[j]!.y0);
          g.x1 = Math.max(g.x1, boxes[j]!.x1); g.y1 = Math.max(g.y1, boxes[j]!.y1);
          used[j] = true; changed = true;
        }
      }
    }
    out.push(g);
  }
  return out;
}

export interface WallSegLite { orient: 'v' | 'h'; coord: number; lo: number; hi: number; sideA: string | null; sideB: string | null; }
export interface WinSpec { orient: 'v' | 'h'; coord: number; lo: number; hi: number; width: number; }

/**
 * Match a window marking to the wall it sits on. Considers walls of the same
 * orientation within `coordTol` of the marking whose span covers the window
 * centre, preferring an exterior face (one side empty) so windows never land on
 * an interior door wall. Returns the wall and the window's u along it.
 */
export function matchWindowToWall(
  win: WinSpec,
  segs: WallSegLite[],
  coordTol = 380,
  overTol = 200,
): { seg: WallSegLite; u: number } | null {
  const center = (win.lo + win.hi) / 2;
  const cands = segs.filter(
    (s) => s.orient === win.orient && Math.abs(s.coord - win.coord) <= coordTol && center >= s.lo - overTol && center <= s.hi + overTol,
  );
  if (cands.length === 0) return null;
  cands.sort((a, b) => {
    const ea = a.sideA === null || a.sideB === null ? 0 : 1;
    const eb = b.sideA === null || b.sideB === null ? 0 : 1;
    return ea !== eb ? ea - eb : Math.abs(a.coord - win.coord) - Math.abs(b.coord - win.coord);
  });
  const seg = cands[0]!;
  return { seg, u: (center - seg.lo) / (seg.hi - seg.lo) };
}
