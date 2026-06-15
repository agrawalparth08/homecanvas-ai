/**
 * Grayscale plan image → binary WALL MASK via LOCAL (adaptive) thresholding.
 *
 * Sibling to ./image-mask, which uses a single GLOBAL Otsu threshold. A global
 * cut fails on PHOTOGRAPHED plans with shadows/gradients: one side of the page is
 * underexposed (whole region trips as "dark"=wall) while the washed-out side loses
 * faint strokes entirely. This module instead compares each pixel to the MEAN of
 * its own neighbourhood, so the decision tracks local lighting — the OpenCV
 * adaptive-threshold intent without the WASM dependency.
 *
 * Same I/O contract as ./image-mask: input is a row-major grayscale buffer
 * (Uint8Array | number[], length w*h, 0..255); output is mask[y][x] with true =
 * WALL = DARK pixel (value below the local mean by more than `c`). invert flips
 * polarity, exactly as MaskOptions.invert does.
 *
 * A SUMMED-AREA TABLE (integral image) makes the window mean O(1) per pixel, so
 * the whole pass is O(w*h). No DOM, no network, no fs, no RNG, no clock — plain
 * data, fully deterministic.
 */

export interface AdaptiveMaskOptions {
  /** Local window size in px; coerced to an odd value. Default 31. */
  window?: number;
  /** Bias subtracted from the local mean. Higher = fewer wall px. Default 8. */
  c?: number;
  /** Default false: DARK (< localMean - c) is wall. True flips polarity. */
  invert?: boolean;
}

/**
 * Grayscale (row-major, 0..255, length w*h) → mask[y][x] (true = wall).
 *
 * For each pixel we take the mean intensity over a `window`×`window` box centred
 * on it (clamped to the image at borders, so edge pixels average a smaller but
 * still valid region) and mark it a wall when value < mean - c. The mean comes
 * from a summed-area table `sat`, where sat[(y+1)*(w+1) + (x+1)] holds the sum of
 * every gray pixel in the rectangle [0..x]×[0..y]; any window sum is then four
 * lookups. The +1 padding row/column of zeros lets the border math avoid special
 * cases. Returns [] for a non-positive dimension, matching ./image-mask.
 */
export function adaptiveMaskFromGrayscale(
  gray: Uint8Array | number[],
  w: number,
  h: number,
  opts?: AdaptiveMaskOptions,
): boolean[][] {
  if (w <= 0 || h <= 0) return [];

  const invert = opts?.invert ?? false;
  const c = opts?.c ?? 8;

  // Window must be odd & >= 1 so it has a single centre pixel; an even request
  // rounds DOWN to the nearest odd (32 → 31) to keep a symmetric half-extent.
  let win = Math.floor(opts?.window ?? 31);
  if (win < 1) win = 1;
  if (win % 2 === 0) win -= 1;
  const r = (win - 1) / 2; // half-window extent in each direction

  // Summed-area table with a zero-padded top row and left column: (w+1)×(h+1).
  // sat index uses stride (w+1); element (X,Y) = sum of gray over [0..X-1]×[0..Y-1].
  const sw = w + 1;
  const sat = new Float64Array(sw * (h + 1));
  for (let y = 0; y < h; y++) {
    const base = y * w;
    const satRow = (y + 1) * sw;
    const satPrev = y * sw;
    let rowSum = 0; // running prefix sum along this scanline
    for (let x = 0; x < w; x++) {
      let v = gray[base + x] ?? 0;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      rowSum += v;
      // SAT recurrence: left-prefix on this row + everything above.
      sat[satRow + x + 1] = (sat[satPrev + x + 1] ?? 0) + rowSum;
    }
  }

  const mask: boolean[][] = new Array<boolean[]>(h);
  for (let y = 0; y < h; y++) {
    const row = new Array<boolean>(w);
    const base = y * w;
    // Vertical window bounds clamped to the image (inclusive).
    const y0 = y - r > 0 ? y - r : 0;
    const y1 = y + r < h - 1 ? y + r : h - 1;
    const topRow = y0 * sw; // SAT row for the inclusive top edge
    const botRow = (y1 + 1) * sw; // SAT row just past the inclusive bottom edge
    const rowsInWindow = y1 - y0 + 1;
    for (let x = 0; x < w; x++) {
      const x0 = x - r > 0 ? x - r : 0;
      const x1 = x + r < w - 1 ? x + r : w - 1;
      // Box sum via the four SAT corners (D - B - C + A).
      const sum =
        sat[botRow + x1 + 1]! -
        sat[topRow + x1 + 1]! -
        sat[botRow + x0]! +
        sat[topRow + x0]!;
      const area = rowsInWindow * (x1 - x0 + 1);
      const mean = sum / area;
      let v = gray[base + x] ?? 0;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      // Wall when strictly darker than the local mean by more than the bias c.
      const dark = v < mean - c;
      row[x] = invert ? !dark : dark;
    }
    mask[y] = row;
  }
  return mask;
}
