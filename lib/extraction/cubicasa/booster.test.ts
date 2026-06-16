import { describe, expect, it } from 'vitest';
import { cubicasaRuntimeAvailable, fitNormalizeChw, resizeNormalizeChw } from './booster';

describe('resizeNormalizeChw', () => {
  it('keeps a same-size image, normalizes to [-1,1], drops alpha, CHW order', () => {
    // 2×1 RGBA: p0 red (255,0,0), p1 green (0,255,0). 255→1, 0→-1 (2*(x/255)-1).
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const out = resizeNormalizeChw({ data, width: 2, height: 1 }, 2, 1);
    expect(out.length).toBe(3 * 2 * 1);
    expect([out[0], out[1]]).toEqual([1, -1]); // R channel
    expect([out[2], out[3]]).toEqual([-1, 1]); // G channel
    expect([out[4], out[5]]).toEqual([-1, -1]); // B channel
  });

  it('resizes to the target dims and preserves a constant grey', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(128);
    const out = resizeNormalizeChw({ data, width: 4, height: 4 }, 8, 8);
    expect(out.length).toBe(3 * 8 * 8);
    const expected = 2 * (128 / 255) - 1;
    expect(out.every((v) => Math.abs(v - expected) < 1e-6)).toBe(true);
  });
});

describe('fitNormalizeChw', () => {
  it('fits the long side, preserves aspect, pads the remainder as background', () => {
    // 4×2 all-black source into dst=8 → scale 2, content 8×4, rows 4..7 padded.
    const data = new Uint8ClampedArray(4 * 2 * 4);
    for (let i = 0; i < 4 * 2; i++) data[i * 4 + 3] = 255; // black (0,0,0), opaque
    const { tensor, contentW, contentH, scale } = fitNormalizeChw({ data, width: 4, height: 2 }, 8);
    expect([contentW, contentH, scale]).toEqual([8, 4, 2]);
    const plane = 8 * 8;
    const at = (c: number, x: number, y: number) => tensor[c * plane + y * 8 + x];
    expect(at(0, 0, 0)).toBe(-1); // content (black) → -1
    expect(at(0, 7, 3)).toBe(-1); // content far corner still inside the box
    expect(at(0, 0, 5)).toBe(1); // padding row → background +1
    expect(at(0, 4, 7)).toBe(1); // padding → +1
  });
});

describe('cubicasaRuntimeAvailable', () => {
  it('resolves to a boolean without throwing (graceful whether or not the optional onnxruntime peer is installed)', async () => {
    expect(typeof (await cubicasaRuntimeAvailable())).toBe('boolean');
  });
});
