import { describe, expect, it } from 'vitest';
import { mmPerPxFromKnownLength, mmToDisplay, parseFeetInches } from './scale';

describe('scale calibration', () => {
  it('derives mm/px from a known-length line', () => {
    expect(mmPerPxFromKnownLength({ x: 0, y: 0 }, { x: 100, y: 0 }, 2500)).toBe(25);
  });

  it('rejects degenerate calibration lines', () => {
    expect(() => mmPerPxFromKnownLength({ x: 0, y: 0 }, { x: 0.2, y: 0 }, 2500)).toThrow();
    expect(() => mmPerPxFromKnownLength({ x: 0, y: 0 }, { x: 100, y: 0 }, -5)).toThrow();
  });

  it('formats display units', () => {
    expect(mmToDisplay(3500, 'metric')).toBe('3.50 m');
    expect(mmToDisplay(450, 'metric')).toBe('450 mm');
    expect(mmToDisplay(3048, 'imperial')).toBe("10'");
  });

  it('parses Indian feet-inches annotations', () => {
    expect(parseFeetInches(`12'6"`)).toBeCloseTo(3810, 0);
    expect(parseFeetInches(`12'-6"`)).toBeCloseTo(3810, 0);
    expect(parseFeetInches(`10'0"`)).toBeCloseTo(3048, 0);
    expect(parseFeetInches(`10'`)).toBeCloseTo(3048, 0);
    expect(parseFeetInches('hello')).toBeNull();
    expect(parseFeetInches(`12'14"`)).toBeNull(); // 14 inches is not a thing
  });
});
