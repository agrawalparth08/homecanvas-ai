/**
 * Straight pixel-space line extraction from a wall mask (for OCR auto-scale).
 *
 * `wallsFromMask` (raster-walls.ts) clusters runs into thickness bands and emits
 * millimetre centerlines for the room interpreter. OCR auto-scale wants something
 * lower-level: the raw, axis-aligned straight SEGMENTS in PIXEL space, so a
 * dimension word ("3600") can be paired with the span it measures
 * (ocr-dimensions.ts `dimensionSamples`). So this mirrors raster-walls' per-row /
 * per-column run detection — including the gap-bridging — but stops before any
 * banding or mm scaling and emits each maximal run as a {x0,y0,x1,y1} segment.
 *
 * Pure data, deterministic: no DOM, no opencv, no network, no random, no clock.
 */

/** A detected straight segment in pixel coords (matches ocr-dimensions DimLine). */
export interface MaskLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LinesFromMaskOptions {
  /** Min run length (px) to count as a line; shorter is speckle. Default ~8. */
  minRunPx?: number;
  /** Bridge colinear gaps up to this many px into one run. Default ~3. */
  mergeGapPx?: number;
}

const DEFAULT_MIN_RUN_PX = 8;
const DEFAULT_MERGE_GAP_PX = 3;

/** A maximal run of wall pixels along one axis at a fixed cross-coordinate. */
interface Run {
  cross: number; // the constant coordinate (column x for vertical, row y for horizontal)
  lo: number; // first wall pixel index along the scan axis (inclusive)
  hi: number; // last wall pixel index along the scan axis (inclusive)
}

/**
 * Maximal runs of `true` along the inner axis for each outer index, bridging
 * inner gaps of <= mergeGap pixels so a doorway or stray mask break does not
 * split one wall into two. `at(outer, inner)` lets one routine serve both
 * vertical scans (outer = column x) and horizontal scans (outer = row y).
 *
 * lo/hi are INCLUSIVE pixel indices (unlike raster-walls' geometric [start, n]
 * extent) because the output segment endpoints are literal pixel coordinates.
 */
function collectRuns(
  outerCount: number,
  innerCount: number,
  at: (outer: number, inner: number) => boolean,
  minLen: number,
  mergeGap: number,
): Run[] {
  const runs: Run[] = [];
  for (let o = 0; o < outerCount; o++) {
    let start = -1; // first on-pixel of the current run, or -1 if none open
    let last = -1; // last on-pixel seen in the current run
    for (let n = 0; n < innerCount; n++) {
      if (at(o, n)) {
        if (start < 0) start = n;
        last = n;
      } else if (start >= 0 && n - last > mergeGap) {
        // gap from `last` to here exceeds the bridge tolerance → close the run
        if (last - start + 1 >= minLen) runs.push({ cross: o, lo: start, hi: last });
        start = -1;
        last = -1;
      }
      // else: off-pixel within the bridge window → keep the run open
    }
    if (start >= 0 && last - start + 1 >= minLen) runs.push({ cross: o, lo: start, hi: last });
  }
  return runs;
}

/** mask[y][x] === true means wall. Returns axis-aligned segments in PIXEL space. */
export function linesFromMask(mask: boolean[][], opts?: LinesFromMaskOptions): MaskLine[] {
  const minRunPx = opts?.minRunPx ?? DEFAULT_MIN_RUN_PX;
  const mergeGapPx = opts?.mergeGapPx ?? DEFAULT_MERGE_GAP_PX;

  const height = mask.length;
  const width = height > 0 ? (mask[0]?.length ?? 0) : 0;
  if (width === 0 || height === 0) return [];

  const px = (y: number, x: number): boolean => mask[y]?.[x] === true;

  // Vertical runs: scan each column (outer = x), runs travel down y → x constant.
  const vRuns = collectRuns(width, height, (x, y) => px(y, x), minRunPx, mergeGapPx);
  // Horizontal runs: scan each row (outer = y), runs travel across x → y constant.
  const hRuns = collectRuns(height, width, (y, x) => px(y, x), minRunPx, mergeGapPx);

  const out: MaskLine[] = [];
  // Stable order: verticals first, then horizontals (collectRuns already walks
  // outer ascending, then inner ascending, so this is fully deterministic).
  for (const r of vRuns) out.push({ x0: r.cross, y0: r.lo, x1: r.cross, y1: r.hi });
  for (const r of hRuns) out.push({ x0: r.lo, y0: r.cross, x1: r.hi, y1: r.cross });
  return out;
}
