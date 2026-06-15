import { describe, it, expect } from 'vitest';
import { estimateSkewAngle, rotateMask } from './deskew';

const DEG2RAD = Math.PI / 180;

/** Blank H×W mask of falses. */
function blank(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
}

/** Draw an axis-aligned rectangle OUTLINE (the four wall strokes) onto a mask. */
function rectOutline(w: number, h: number, x0: number, y0: number, x1: number, y1: number): boolean[][] {
  const mask = blank(w, h);
  for (let x = x0; x <= x1; x++) {
    mask[y0]![x] = true;
    mask[y1]![x] = true;
  }
  for (let y = y0; y <= y1; y++) {
    mask[y]![x0] = true;
    mask[y]![x1] = true;
  }
  return mask;
}

/** Forward-rotate a mask's true pixels by `deg` about centre, splatting into a fresh mask. */
function rotatePixels(mask: boolean[][], deg: number): boolean[][] {
  const h = mask.length;
  const w = mask[0]!.length;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const cos = Math.cos(deg * DEG2RAD);
  const sin = Math.sin(deg * DEG2RAD);
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y]![x]) {
        const dx = x - cx;
        const dy = y - cy;
        const nx = Math.round(cos * dx - sin * dy + cx);
        const ny = Math.round(sin * dx + cos * dy + cy);
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny]![nx] = true;
      }
    }
  }
  return out;
}

/** Sum of squared row+col histogram counts — higher = sharper / more axis-aligned. */
function sharpness(mask: boolean[][]): number {
  const h = mask.length;
  const w = mask[0]!.length;
  const rows = new Array<number>(h).fill(0);
  const cols = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y]![x]) {
        rows[y]!++;
        cols[x]!++;
      }
    }
  }
  let s = 0;
  for (const c of rows) s += c * c;
  for (const c of cols) s += c * c;
  return s;
}

describe('estimateSkewAngle', () => {
  it('returns ~0 for an axis-aligned rectangle (no skew)', () => {
    const mask = rectOutline(60, 60, 8, 8, 51, 51);
    const angle = estimateSkewAngle(mask);
    expect(Math.abs(angle)).toBeLessThan(0.5 * DEG2RAD);
  });

  it('returns ~ -5deg for a rectangle skewed by +5deg', () => {
    const upright = rectOutline(60, 60, 8, 8, 51, 51);
    const skewed = rotatePixels(upright, 5);
    const angle = estimateSkewAngle(skewed);
    // correcting angle should be the negative of the +5deg skew, within ~1.5deg
    expect(angle).toBeLessThan(0);
    expect(Math.abs(angle - -5 * DEG2RAD)).toBeLessThan(1.5 * DEG2RAD);
  });

  it('rotating by the estimated angle sharpens the projection profile', () => {
    const upright = rectOutline(60, 60, 8, 8, 51, 51);
    const skewed = rotatePixels(upright, 5);
    const angle = estimateSkewAngle(skewed);
    const corrected = rotateMask(skewed, angle);
    expect(sharpness(corrected)).toBeGreaterThan(sharpness(skewed));
  });

  // edge case: empty mask has no pixels to score → no skew
  it('returns 0 for an empty mask', () => {
    expect(estimateSkewAngle([])).toBe(0);
    expect(estimateSkewAngle(blank(0, 0))).toBe(0);
  });

  // edge case: a single wall pixel is rotation-invariant → no detectable skew
  it('returns 0 for a single-pixel mask', () => {
    const mask = blank(10, 10);
    mask[5]![5] = true;
    expect(estimateSkewAngle(mask)).toBe(0);
  });

  // edge case: degenerate options (non-positive step/range) fall back to 0
  it('returns 0 when search options are degenerate', () => {
    const mask = rectOutline(60, 60, 8, 8, 51, 51);
    expect(estimateSkewAngle(mask, { maxDeg: 0 })).toBe(0);
    expect(estimateSkewAngle(mask, { stepDeg: 0 })).toBe(0);
  });
});

describe('rotateMask', () => {
  it('preserves dimensions and is identity at angle 0', () => {
    const mask = rectOutline(20, 16, 3, 3, 16, 12);
    const out = rotateMask(mask, 0);
    expect(out.length).toBe(16);
    expect(out[0]!.length).toBe(20);
    expect(out).toEqual(mask);
  });

  it('returns [] for an empty mask', () => {
    expect(rotateMask([], 0.1)).toEqual([]);
    expect(rotateMask(blank(0, 0), 0.1)).toEqual([]);
  });

  it('keeps the centre pixel set under rotation (rotation fixes the centre)', () => {
    // odd dims → an exact integer centre that maps to itself
    const mask = blank(11, 11);
    mask[5]![5] = true;
    const out = rotateMask(mask, 12 * DEG2RAD);
    expect(out[5]![5]).toBe(true);
  });
});
