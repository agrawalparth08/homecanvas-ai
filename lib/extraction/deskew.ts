/**
 * Estimate + undo small raster skew before vectorizing a wall mask (Path B no-CAD).
 *
 * A scanned/photographed plan is often rotated a few degrees, so the axis-aligned
 * run scanner in ./raster-walls (which reads mask[y][x] === true as a wall pixel)
 * sees long walls broken into stair-steps and misses them. This module finds that
 * small skew with a projection-profile / variance search and hands back the angle
 * to ROTATE the mask by so walls land upright, plus a nearest-neighbour rotate.
 *
 * Pure & deterministic: no DOM, no opencv, no network, no fs, no RNG, no clock.
 */

export interface DeskewOptions {
  /** Half-width of the angle search in degrees (search [-maxDeg, +maxDeg]). Default 8. */
  maxDeg?: number;
  /** Angle step in degrees. Default 0.5. */
  stepDeg?: number;
}

const DEG2RAD = Math.PI / 180;

/**
 * Minimum relative score gain over angle 0 to accept a non-zero skew.
 * Bin-edge aliasing perturbs the score by well under 1% between adjacent
 * candidate angles; a real few-degree skew lifts whole walls onto an axis and
 * gains far more. 2% sits comfortably between the two regimes.
 */
const MIN_REL_GAIN = 0.02;

/** Coordinates of every wall pixel, plus the mask's centre (rotation pivot). */
interface WallPoints {
  xs: number[];
  ys: number[];
  cx: number;
  cy: number;
}

/** Collect the (x,y) of each true pixel once so the angle sweep never re-scans the mask. */
function collectWallPoints(mask: boolean[][]): WallPoints {
  const h = mask.length;
  const w = h > 0 ? (mask[0]?.length ?? 0) : 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) {
    const row = mask[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === true) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  // pixel-centre pivot; w/h may be 0 but then xs/ys are empty and centre is unused
  return { xs, ys, cx: (w - 1) / 2, cy: (h - 1) / 2 };
}

/**
 * Projection-profile score for rotating the points by `angleRad`.
 *
 * We rotate only the true-pixel coordinates (cheap), bin their rotated y onto a
 * 1px histogram, and return the SUM OF SQUARED bin counts. When walls are
 * axis-aligned their pixels pile into a few rows, giving tall sharp peaks and a
 * high sum-of-squares; a skewed wall smears across many rows, lowering it. We
 * also fold the rotated x onto the same histogram so vertical walls (which peak
 * in columns) contribute too — both axes sharpen at the same correcting angle.
 */
function projectionScore(pts: WallPoints, angleRad: number): number {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const { xs, ys, cx, cy } = pts;
  const n = xs.length;

  // Find the rotated y-extent so the histogram is exactly sized (no full image).
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - cx;
    const dy = ys[i]! - cy;
    const ry = -sin * dx + cos * dy;
    const rx = cos * dx + sin * dy;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
  }
  if (n === 0) return 0;

  const yBins = Math.floor(maxY - minY) + 1;
  const xBins = Math.floor(maxX - minX) + 1;
  const yHist = new Array<number>(yBins).fill(0);
  const xHist = new Array<number>(xBins).fill(0);
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - cx;
    const dy = ys[i]! - cy;
    const ry = -sin * dx + cos * dy;
    const rx = cos * dx + sin * dy;
    const yb = Math.floor(ry - minY);
    const xb = Math.floor(rx - minX);
    if (yb >= 0 && yb < yBins) yHist[yb]!++;
    if (xb >= 0 && xb < xBins) xHist[xb]!++;
  }

  let score = 0;
  for (let b = 0; b < yBins; b++) {
    const c = yHist[b]!;
    score += c * c;
  }
  for (let b = 0; b < xBins; b++) {
    const c = xHist[b]!;
    score += c * c;
  }
  return score;
}

/**
 * Angle (RADIANS) to ROTATE the mask by to make walls axis-aligned.
 *
 * Sweeps candidate skews in [-maxDeg, +maxDeg] at `stepDeg`, scores each by the
 * projection sharpness above, and returns the NEGATIVE of the best-scoring skew
 * (the rotation that undoes it). Ties resolve to the smaller absolute angle so a
 * clean axis-aligned mask returns exactly 0. Empty/degenerate masks return 0.
 */
export function estimateSkewAngle(mask: boolean[][], opts?: DeskewOptions): number {
  const maxDeg = opts?.maxDeg ?? 8;
  const stepDeg = opts?.stepDeg ?? 0.5;
  if (!(maxDeg > 0) || !(stepDeg > 0)) return 0;

  const pts = collectWallPoints(mask);
  if (pts.xs.length === 0) return 0;

  // Walk integer step indices so floating accumulation can't drift off the grid.
  const steps = Math.floor(maxDeg / stepDeg);

  // An already-upright mask scores near-maximal at 0, but sub-pixel bin-edge
  // aliasing lets a tiny rotation edge it out by a hair. Only accept a non-zero
  // skew when it beats the zero-angle score by a real margin (a genuine few-deg
  // skew rotates whole diagonal walls onto axes → a large jump, far past noise),
  // so a clean axis-aligned mask deterministically returns exactly 0.
  const zeroScore = projectionScore(pts, 0);
  const acceptScore = zeroScore * (1 + MIN_REL_GAIN);

  let bestSkewDeg = 0;
  let bestScore = acceptScore;
  for (let k = 1; k <= steps; k++) {
    const deg = k * stepDeg;
    // try both signs; strictly-greater keeps the smaller |angle| on ties
    const posScore = projectionScore(pts, deg * DEG2RAD);
    if (posScore > bestScore) {
      bestScore = posScore;
      bestSkewDeg = deg;
    }
    const negScore = projectionScore(pts, -deg * DEG2RAD);
    if (negScore > bestScore) {
      bestScore = negScore;
      bestSkewDeg = -deg;
    }
  }

  // detected skew is bestSkewDeg; rotate by its negative to undo it.
  // (bestSkewDeg===0 → return +0, never -0, since -0*… would surface as -0)
  return bestSkewDeg === 0 ? 0 : -bestSkewDeg * DEG2RAD;
}

/**
 * Nearest-neighbour rotate of a boolean mask about its centre by `angleRad`.
 *
 * Output has the same dims as the input. For each output pixel we inverse-map to
 * the source (rotate by -angle about the shared centre) and sample the nearest
 * source pixel; out-of-bounds samples are false. Inverse mapping guarantees every
 * output pixel is filled (no holes from forward scatter).
 */
export function rotateMask(mask: boolean[][], angleRad: number): boolean[][] {
  const h = mask.length;
  const w = h > 0 ? (mask[0]?.length ?? 0) : 0;
  if (w === 0 || h === 0) return [];

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  // inverse rotation: output→source is rotation by -angle
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);

  const out: boolean[][] = new Array<boolean[]>(h);
  for (let y = 0; y < h; y++) {
    const row = new Array<boolean>(w).fill(false);
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const sx = Math.round(cos * dx - sin * dy + cx);
      const sy = Math.round(sin * dx + cos * dy + cy);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h && mask[sy]?.[sx] === true) {
        row[x] = true;
      }
    }
    out[y] = row;
  }
  return out;
}
