import { describe, expect, it } from 'vitest';
import { cubicasaRuntimeAvailable, resizeNormalizeChw } from './booster';

describe('resizeNormalizeChw', () => {
  it('keeps a same-size image, normalizes to [0,1], drops alpha, CHW order', () => {
    // 2×1 RGBA: p0 red (255,0,0), p1 green (0,255,0)
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const out = resizeNormalizeChw({ data, width: 2, height: 1 }, 2, 1);
    expect(out.length).toBe(3 * 2 * 1);
    expect([out[0], out[1]]).toEqual([1, 0]); // R channel
    expect([out[2], out[3]]).toEqual([0, 1]); // G channel
    expect([out[4], out[5]]).toEqual([0, 0]); // B channel
  });

  it('resizes to the target dims and preserves a constant grey', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(128);
    const out = resizeNormalizeChw({ data, width: 4, height: 4 }, 8, 8);
    expect(out.length).toBe(3 * 8 * 8);
    expect(out.every((v) => Math.abs(v - 128 / 255) < 1e-6)).toBe(true);
  });
});

describe('cubicasaRuntimeAvailable', () => {
  it('is false when onnxruntime-web is not installed (optional peer dep)', async () => {
    expect(await cubicasaRuntimeAvailable()).toBe(false);
  });
});
