/**
 * Vector-PDF front door (Phase 0, Path B).
 *
 * A CAD-exported PDF page is "vector-rich": thousands of stroke/path ops and
 * little-to-no raster image. We take its already-extracted coloured segments
 * (see scripts/trace/lib.mjs `extractSegments` → [x0,y0,x1,y1,colorHex]) and
 * turn them into a PrimitivePlan using the shared colour heuristics:
 *   black -> walls, orange -> window openings, magenta -> columns.
 *
 * The pdfjs page-loading layer is deliberately OUT of this module: callers pass
 * the segments in, so the core converter is pure and unit-testable with no real
 * PDF. The detection helper (`isVectorRich`) only needs the page's op counts.
 */
import { parsePrimitivePlan, type PrimitivePlan } from '../extraction/primitive-plan';
import { groupColorFeatures, type ColorSegment } from '../extraction/color-features';

/** Rough operator-type counts for one PDF page (from a pdfjs operator list). */
export interface PageOpCounts {
  /** stroke ops (S / s / B …). */
  stroke?: number;
  /** path-construction ops (constructPath). */
  path?: number;
  /** raster image paint ops (paintImageXObject …). */
  image?: number;
}

/**
 * Decide whether a page is vector-rich (a CAD drawing) vs a scanned raster.
 * Vector iff it has many stroke/path ops AND essentially no big images — a
 * scanned plan is one image op and ~no vector strokes.
 */
export function isVectorRich(opCounts: PageOpCounts): boolean {
  const stroke = opCounts.stroke ?? 0;
  const path = opCounts.path ?? 0;
  const image = opCounts.image ?? 0;
  const vectorOps = stroke + path;
  return vectorOps >= 50 && image <= 1;
}

/** Midpoint of a segment. */
function midpoint(s: ColorSegment) {
  return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
}

/** Euclidean length of a segment. */
function length(s: ColorSegment): number {
  return Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
}

/** Options for the vector→plan conversion. */
export interface PdfVectorOpts {
  /** mm per source (PDF point/pixel) unit; defaults to 1 (identity). */
  unitsToMm?: number;
}

/**
 * Convert already-extracted coloured segments into a validated PrimitivePlan.
 * Walls map 1:1 to free a→b segments; clustered orange features become window
 * openings (centre = midpoint, width = span); clustered magenta features become
 * columns (bbox → centre + width/depth). Coordinates stay in SOURCE units.
 */
export function pdfVectorToPrimitivePlan(segs: ColorSegment[], opts: PdfVectorOpts = {}): PrimitivePlan {
  const { walls, openings, columns } = groupColorFeatures(segs);

  const planWalls = walls.map((w) => ({
    a: { x: w.x0, y: w.y0 },
    b: { x: w.x1, y: w.y1 },
    layer: 'vector-pdf:wall',
  }));

  const planOpenings = openings
    .map((o) => ({ kind: 'window' as const, center: midpoint(o), width: length(o) }))
    .filter((o) => o.width > 0);

  const planColumns = columns.map((c) => {
    const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1);
    const y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1);
    // Clustered columns collapse to a centreline; give degenerate boxes a min
    // footprint so width/depth stay strictly positive (schema requires it).
    const width = Math.max(x1 - x0, 1);
    const depth = Math.max(y1 - y0, 1);
    return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, width, depth };
  });

  return parsePrimitivePlan({
    source: 'vector-pdf',
    unitsToMm: opts.unitsToMm ?? 1,
    walls: planWalls,
    openings: planOpenings,
    columns: planColumns,
  });
}
