/**
 * Shared colour heuristics for vector floor plans (Phase 0, Path B).
 *
 * Codifies the proven stroke-colour convention from scripts/trace/extract-features.mjs
 * so any vector source (PDF, SVG) can split its segments by meaning before they
 * become a PrimitivePlan:
 *   - near-black            -> WALL
 *   - near #ff7f00 (orange) -> OPENING (the orange gap marks a window)
 *   - near #ff00ff (magenta)-> COLUMN  (structural pillar, cannot be removed)
 *   - anything else         -> other (dimension lines, hatching, text…)
 *
 * Matching is tolerant (channel distance) because real PDFs anti-alias and round
 * colours; clustering merges the many short segments a single opening/column is
 * drawn with into one feature. Pure + typed: no PDF, no I/O — unit-testable.
 */

/** A drawn segment in source (pixel) space, tagged with its stroke colour. */
export interface ColorSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** stroke colour as a hex string, e.g. '#ff7f00' (any case, 3- or 6-digit). */
  color: string;
}

/** Semantic bucket a stroke colour maps to. */
export type ColorFeatureKind = 'wall' | 'opening' | 'column' | 'other';

/** Parse a #rgb / #rrggbb hex string to [r,g,b] (0-255), or null if unparseable. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Chebyshev (max-channel) distance between two RGB triples, 0-255. */
function rgbDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

const ORANGE: [number, number, number] = [0xff, 0x7f, 0x00];
const MAGENTA: [number, number, number] = [0xff, 0x00, 0xff];
/** Per-channel tolerance for "near" colour matching (covers AA + rounding). */
const TOL = 48;

/** Classify a stroke colour into wall / opening / column / other (tolerant). */
export function classifySegmentColor(hex: string): ColorFeatureKind {
  const rgb = parseHex(hex);
  if (!rgb) return 'other';
  // near-black -> wall (low luminance, regardless of exact channel mix).
  if (rgb[0] <= TOL && rgb[1] <= TOL && rgb[2] <= TOL) return 'wall';
  if (rgbDist(rgb, ORANGE) <= TOL) return 'opening';
  if (rgbDist(rgb, MAGENTA) <= TOL) return 'column';
  return 'other';
}

/** Axis-aligned bounding box of a segment. */
function segBounds(s: ColorSegment) {
  return {
    x0: Math.min(s.x0, s.x1),
    y0: Math.min(s.y0, s.y1),
    x1: Math.max(s.x0, s.x1),
    y1: Math.max(s.y0, s.y1),
  };
}

/** True when two segment bounding boxes are within `gap` of each other. */
function boxesNear(a: ColorSegment, b: ColorSegment, gap: number): boolean {
  const ba = segBounds(a), bb = segBounds(b);
  return ba.x0 <= bb.x1 + gap && bb.x0 <= ba.x1 + gap && ba.y0 <= bb.y1 + gap && bb.y0 <= ba.y1 + gap;
}

/**
 * Union-find clustering of nearby segments (transitive: A~B, B~C ⇒ {A,B,C}).
 * Returns one merged segment per cluster: endpoints span the cluster's extreme
 * points along its dominant axis, so an opening/column drawn as many ticks
 * collapses to a single feature. `gap` is the merge proximity in source units.
 */
function clusterSegments(segs: ColorSegment[], gap: number): ColorSegment[] {
  const n = segs.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i]! !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; }
    return i;
  };
  const union = (i: number, j: number) => { parent[find(i)] = find(j); };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (boxesNear(segs[i]!, segs[j]!, gap)) union(i, j);
    }
  }
  const groups = new Map<number, ColorSegment[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(segs[i]!);
  }
  const out: ColorSegment[] = [];
  for (const members of groups.values()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of members) {
      const b = segBounds(m);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    const color = members[0]!.color;
    // Emit the cluster as a segment along its dominant axis (longer span wins),
    // so length === feature width/extent. Diagonal clusters keep the box diagonal.
    if (x1 - x0 >= y1 - y0) out.push({ x0, y0: (y0 + y1) / 2, x1, y1: (y0 + y1) / 2, color });
    else out.push({ x0: (x0 + x1) / 2, y0, x1: (x0 + x1) / 2, y1, color });
  }
  return out;
}

/** Grouped colour features: walls kept per-segment, openings/columns clustered. */
export interface ColorFeatures {
  walls: ColorSegment[];
  openings: ColorSegment[];
  columns: ColorSegment[];
}

/**
 * Split segments by colour and cluster the opening/column buckets into one
 * segment per feature. Walls stay one-per-segment (the wall grid is built
 * downstream). `gap` controls opening/column merge proximity (source units).
 */
export function groupColorFeatures(segs: ColorSegment[], gap = 18): ColorFeatures {
  const walls: ColorSegment[] = [];
  const openingRaw: ColorSegment[] = [];
  const columnRaw: ColorSegment[] = [];
  for (const s of segs) {
    switch (classifySegmentColor(s.color)) {
      case 'wall': walls.push(s); break;
      case 'opening': openingRaw.push(s); break;
      case 'column': columnRaw.push(s); break;
      default: break; // 'other' is dropped (dimensions, hatching, text…)
    }
  }
  return {
    walls,
    openings: clusterSegments(openingRaw, gap),
    columns: clusterSegments(columnRaw, gap),
  };
}
