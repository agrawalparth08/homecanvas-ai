import { describe, expect, it } from 'vitest';
import {
  argmaxClassMap,
  cubicasaSegToPlan,
  wallMaskFromSeg,
  CUBICASA_WALL_CLASS,
  type CubicasaSeg,
} from './masks-to-plan';

/** A class map with a rectangular wall-class ring of thickness `t` (interior = Living Room). */
function ringSeg(w: number, h: number, t: number): CubicasaSeg {
  const classMap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onBorder = x < t || x >= w - t || y < t || y >= h - t;
      classMap[y * w + x] = onBorder ? CUBICASA_WALL_CLASS : 4; // 4 = Living Room
    }
  }
  return { width: w, height: h, classMap };
}

describe('argmaxClassMap', () => {
  it('picks the max channel per pixel (CHW layout)', () => {
    // 2 px, 3 classes, channel-major: [c0(p0,p1), c1(p0,p1), c2(p0,p1)]
    const logits = [0.1, 0.9, 0.8, 0.1, 0.2, 0.3];
    expect([...argmaxClassMap(logits, 2, 1, 3, 'CHW').classMap]).toEqual([1, 0]);
  });
  it('handles HWC layout', () => {
    const logits = [0.1, 0.8, 0.2, 0.9, 0.1, 0.3]; // p0:[.1,.8,.2] -> c1, p1:[.9,.1,.3] -> c0
    expect([...argmaxClassMap(logits, 2, 1, 3, 'HWC').classMap]).toEqual([1, 0]);
  });
  it('argmaxes a channel SLICE via channelOffset (skips leading heatmap channels)', () => {
    // 1px, 5 channels CHW: [9, 0.1, 0.8, 0.2, 9]; take 3 classes at offset 1 -> [.1,.8,.2] -> class 1
    expect([...argmaxClassMap([9, 0.1, 0.8, 0.2, 9], 1, 1, 3, 'CHW', 1, 5).classMap]).toEqual([1]);
  });
});

describe('wallMaskFromSeg', () => {
  it('marks only wall-class pixels', () => {
    const mask = wallMaskFromSeg(ringSeg(6, 5, 1));
    expect(mask[0]!.every((v) => v)).toBe(true); // top row is all wall
    expect(mask[2]![0]).toBe(true); // left border is wall
    expect(mask[2]![2]).toBe(false); // interior is not wall
  });
});

describe('cubicasaSegToPlan', () => {
  it('produces walls from a wall-class ring via the shared raster path', () => {
    const plan = cubicasaSegToPlan(ringSeg(60, 50, 2), { mmPerPx: 100 });
    expect(plan.source).toBe('raster-cv');
    expect(plan.walls.length).toBeGreaterThanOrEqual(4); // four sides of the ring
  });
  it('returns no walls for an all-background segmentation', () => {
    const seg: CubicasaSeg = { width: 40, height: 30, classMap: new Uint8Array(40 * 30) };
    expect(cubicasaSegToPlan(seg, { mmPerPx: 100 }).walls).toHaveLength(0);
  });
});
