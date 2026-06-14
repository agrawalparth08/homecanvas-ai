/**
 * Grayscale plan image → binary WALL MASK (pure raster CV core, no opencv).
 *
 * The raster path (no CAD) starts from a scanned/photographed floor plan. Once
 * the opencv deskew step (elsewhere) hands us a plain grayscale buffer, THIS is
 * the threshold step that turns it into a boolean mask: mask[y][x] === true marks
 * a WALL pixel. Dark strokes on light paper are the walls, so by default pixels
 * DARKER than the threshold become true — exactly what wallsFromMask in
 * ./raster-walls expects to vectorize.
 *
 * The auto threshold uses Otsu's method (maximize between-class variance over the
 * 256-bin histogram). No DOM, no network, no fs, no RNG, no clock — plain data,
 * fully deterministic, O(w*h).
 */

export interface MaskOptions {
  /** Default false: DARK pixels (< threshold) are wall=true. True flips polarity. */
  invert?: boolean;
  /** 0..255 override; if omitted the threshold is computed via Otsu. */
  threshold?: number;
  /** Drop isolated wall pixels with fewer than this many 4-neighbour walls (speckle). */
  minRun?: number;
}

/**
 * Otsu's threshold over a grayscale buffer.
 *
 * Build the 256-bin intensity histogram, then sweep every possible split t,
 * tracking the running zeroth/first moments so the between-class variance
 * σ²_b(t) = w0·w1·(µ0 − µ1)² is an O(256) incremental update rather than a
 * re-scan. The split that maximizes σ²_b is the returned threshold (0..255):
 * pixels with value < threshold fall in the "dark"/foreground class. An empty
 * buffer has no modes to separate, so we return 0 (degenerate but defined).
 */
export function otsuThreshold(gray: Uint8Array | number[]): number {
  const n = gray.length;
  if (n === 0) return 0;

  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) {
    // clamp + floor so out-of-range/fractional inputs land in a valid bin
    let v = gray[i] ?? 0;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    hist[Math.floor(v)]!++;
  }

  // total first moment (sum of intensity*count) for the µ1 derivation
  let total1 = 0;
  for (let t = 0; t < 256; t++) total1 += t * hist[t]!;

  let w0 = 0;          // count in class 0 (values <= t)
  let sum0 = 0;        // first moment in class 0
  let bestVar = -1;
  let bestT = 0;
  for (let t = 0; t < 256; t++) {
    w0 += hist[t]!;
    if (w0 === 0) continue;          // no pixels on the low side yet
    const w1 = n - w0;
    if (w1 === 0) break;             // everything is on the low side → done
    sum0 += t * hist[t]!;
    const mu0 = sum0 / w0;
    const mu1 = (total1 - sum0) / w1;
    const diff = mu0 - mu1;
    const between = w0 * w1 * diff * diff;
    if (between > bestVar) {
      bestVar = between;
      // wall test is strict `< threshold`, so split BELOW the next bin: t+1
      bestT = t + 1;
    }
  }
  // clamp: a perfectly uniform image leaves bestT at the high edge; keep 0..255
  return Math.min(255, Math.max(0, bestT));
}

/**
 * Grayscale (row-major, 0..255, length w*h) → mask[y][x] (true = wall).
 *
 * `gray[y*w + x]` is compared to the threshold (Otsu by default, or the explicit
 * override). With invert=false a pixel is a wall when value < threshold (dark
 * strokes); invert=true makes light pixels the walls instead. Optional speckle
 * removal flips a wall pixel back to false when it has fewer than `minRun` of its
 * four orthogonal neighbours also marked wall — killing isolated specks without
 * eroding solid strokes. Speckle removal reads the original mask (one pass) so
 * neighbour decisions don't cascade.
 */
export function maskFromGrayscale(
  gray: Uint8Array | number[],
  w: number,
  h: number,
  opts?: MaskOptions,
): boolean[][] {
  const invert = opts?.invert ?? false;
  const minRun = opts?.minRun ?? 0;
  // explicit threshold wins; otherwise auto via Otsu
  const threshold = opts?.threshold ?? otsuThreshold(gray);

  if (w <= 0 || h <= 0) return [];

  // raw threshold pass: dark<threshold → wall (flipped when invert)
  const mask: boolean[][] = new Array<boolean[]>(h);
  for (let y = 0; y < h; y++) {
    const row = new Array<boolean>(w);
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const v = gray[base + x] ?? 0;
      const dark = v < threshold;
      row[x] = invert ? !dark : dark;
    }
    mask[y] = row;
  }

  if (minRun <= 0) return mask;

  // Speckle removal: a wall pixel survives only with >= minRun wall neighbours.
  // Read `mask` (unmutated) and write `out` so the test is on the input snapshot,
  // making the operation order-independent and deterministic.
  const out: boolean[][] = new Array<boolean[]>(h);
  for (let y = 0; y < h; y++) {
    const src = mask[y]!;
    const row = new Array<boolean>(w);
    for (let x = 0; x < w; x++) {
      if (!src[x]) { row[x] = false; continue; }
      let nb = 0;
      if (y > 0 && mask[y - 1]![x]) nb++;
      if (y + 1 < h && mask[y + 1]![x]) nb++;
      if (x > 0 && src[x - 1]) nb++;
      if (x + 1 < w && src[x + 1]) nb++;
      row[x] = nb >= minRun;
    }
    out[y] = row;
  }
  return out;
}
