import { describe, expect, it } from 'vitest';
import { clampSliderPos } from './compare';

describe('clampSliderPos', () => {
  it('maps clientX linearly within the rect', () => {
    expect(clampSliderPos(50, { left: 0, width: 100 })).toBeCloseTo(0.5, 6);
    expect(clampSliderPos(75, { left: 0, width: 100 })).toBeCloseTo(0.75, 6);
    expect(clampSliderPos(120, { left: 100, width: 200 })).toBeCloseTo(0.1, 6);
  });
  it('clamps to [0,1]', () => {
    expect(clampSliderPos(-50, { left: 0, width: 100 })).toBe(0);
    expect(clampSliderPos(999, { left: 0, width: 100 })).toBe(1);
  });
  it('hits the exact in-range endpoints via the computed path', () => {
    expect(clampSliderPos(0, { left: 0, width: 100 })).toBe(0);
    expect(clampSliderPos(100, { left: 0, width: 100 })).toBe(1);
    expect(clampSliderPos(100, { left: 100, width: 200 })).toBe(0);
  });
  it('returns 0 for a zero-width rect or non-finite input', () => {
    expect(clampSliderPos(50, { left: 0, width: 0 })).toBe(0);
    expect(clampSliderPos(NaN, { left: 0, width: 100 })).toBe(0);
    expect(clampSliderPos(50, { left: NaN, width: 100 })).toBe(0);
  });
});
