import { describe, expect, it } from 'vitest';
import { maskFromGrayscale, otsuThreshold } from './image-mask';

describe('otsuThreshold', () => {
  it('returns a value between the two modes of a clean bimodal histogram', () => {
    // 50 dark pixels at 40, 50 light pixels at 200 → split must sit between them
    const gray = [
      ...new Array<number>(50).fill(40),
      ...new Array<number>(50).fill(200),
    ];
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThanOrEqual(200);
  });

  it('is deterministic and within 0..255 for a uniform image', () => {
    const gray = new Array<number>(64).fill(128);
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
    expect(otsuThreshold(gray)).toBe(t); // same input → same output
  });

  it('returns 0 for an empty buffer (degenerate but defined)', () => {
    expect(otsuThreshold([])).toBe(0);
  });

  it('clamps and bins out-of-range / fractional values without throwing', () => {
    const gray = [-10, 0.5, 255.9, 1000, 30, 30, 220, 220];
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
  });
});

describe('maskFromGrayscale', () => {
  // 8x8 light (200) field with a 1px dark (40) border rectangle.
  const W = 8;
  const H = 8;
  const buildBorder = (): number[] => {
    const g = new Array<number>(W * H).fill(200);
    for (let x = 0; x < W; x++) {
      g[0 * W + x] = 40;          // top row
      g[(H - 1) * W + x] = 40;    // bottom row
    }
    for (let y = 0; y < H; y++) {
      g[y * W + 0] = 40;          // left col
      g[y * W + (W - 1)] = 40;    // right col
    }
    return g;
  };

  it('marks the dark border as wall=true and the light interior as false (Otsu auto)', () => {
    const mask = maskFromGrayscale(buildBorder(), W, H);
    expect(mask.length).toBe(H);
    expect(mask[0]!.length).toBe(W);

    // border pixels are wall
    expect(mask[0]![0]).toBe(true);   // corner
    expect(mask[0]![3]).toBe(true);   // top edge
    expect(mask[3]![0]).toBe(true);   // left edge
    expect(mask[H - 1]![W - 1]).toBe(true); // far corner

    // interior is not wall
    expect(mask[3]![3]).toBe(false);
    expect(mask[4]![4]).toBe(false);
  });

  it('invert flips polarity: light interior becomes wall, dark border does not', () => {
    const mask = maskFromGrayscale(buildBorder(), W, H, { invert: true });
    expect(mask[3]![3]).toBe(true);   // interior now wall
    expect(mask[0]![0]).toBe(false);  // border no longer wall
  });

  it('honours an explicit threshold override', () => {
    // threshold 100: 40<100 → dark wall, 200>=100 → not. Same result as auto here.
    const mask = maskFromGrayscale(buildBorder(), W, H, { threshold: 100 });
    expect(mask[0]![0]).toBe(true);
    expect(mask[3]![3]).toBe(false);
  });

  it('removes a single speckle pixel when minRun>0', () => {
    // all-light field with one lone dark pixel in the middle → it's an isolated
    // wall with zero wall-neighbours, so minRun=1 must erase it.
    const g = new Array<number>(W * H).fill(200);
    g[3 * W + 3] = 40;
    const noClean = maskFromGrayscale(g, W, H, { threshold: 100 });
    expect(noClean[3]![3]).toBe(true); // present before cleanup

    const cleaned = maskFromGrayscale(g, W, H, { threshold: 100, minRun: 1 });
    expect(cleaned[3]![3]).toBe(false); // speckle removed
  });

  it('keeps wall pixels that have enough neighbours under minRun', () => {
    // a 2x2 dark block: each pixel has exactly 2 wall neighbours → survives minRun=2
    const g = new Array<number>(W * H).fill(200);
    g[2 * W + 2] = 40;
    g[2 * W + 3] = 40;
    g[3 * W + 2] = 40;
    g[3 * W + 3] = 40;
    const cleaned = maskFromGrayscale(g, W, H, { threshold: 100, minRun: 2 });
    expect(cleaned[2]![2]).toBe(true);
    expect(cleaned[3]![3]).toBe(true);
  });

  it('returns [] for non-positive dimensions', () => {
    expect(maskFromGrayscale([], 0, 0)).toEqual([]);
    expect(maskFromGrayscale([10, 20], 0, 2)).toEqual([]);
  });
});
