import { describe, it, expect } from 'vitest';
import {
  parseDimensionMm,
  mmPerPxFromDimensions,
  type DimSample,
} from './auto-scale';

describe('parseDimensionMm', () => {
  it('parses feet-inches via parseFeetInches (mm)', () => {
    // 12'0" = 144 in * 25.4 = 3657.6 mm
    expect(parseDimensionMm("12'0\"")).toBeCloseTo(3657.6, 3);
    expect(parseDimensionMm("12'-6\"")).toBeCloseTo((12 * 12 + 6) * 25.4, 3);
  });

  it('parses metres to mm', () => {
    expect(parseDimensionMm('3.6m')).toBe(3600);
    expect(parseDimensionMm('3.6 m')).toBe(3600);
    expect(parseDimensionMm('4M')).toBe(4000);
  });

  it('parses plain mm with and without suffix', () => {
    expect(parseDimensionMm('3600')).toBe(3600);
    expect(parseDimensionMm('3600mm')).toBe(3600);
    expect(parseDimensionMm('900 mm')).toBe(900);
  });

  it('does not misread "3600mm" as metres', () => {
    // METRES_RE is anchored; the embedded "m" must not steal the match.
    expect(parseDimensionMm('3600mm')).toBe(3600);
  });

  it('returns null for garbage / out-of-range labels', () => {
    expect(parseDimensionMm('abc')).toBeNull();
    expect(parseDimensionMm('')).toBeNull();
    expect(parseDimensionMm('12')).toBeNull(); // too few digits for plain mm
    expect(parseDimensionMm('123456')).toBeNull(); // too many digits
  });
});

describe('mmPerPxFromDimensions', () => {
  it('happy path: 12\'0" over 300px ~= 12.19 mm/px', () => {
    const r = mmPerPxFromDimensions([{ text: "12'0\"", pixels: 300 }]);
    expect(r).not.toBeNull();
    expect(r!.samples).toBe(1);
    expect(r!.mmPerPx).toBeCloseTo(3657.6 / 300, 4); // ~12.192
  });

  it('plain "3600" @ 300px -> 12 mm/px', () => {
    const r = mmPerPxFromDimensions([{ text: '3600', pixels: 300 }]);
    expect(r!.mmPerPx).toBe(12);
  });

  it('"3.6m" @ 300px -> 12 mm/px', () => {
    const r = mmPerPxFromDimensions([{ text: '3.6m', pixels: 300 }]);
    expect(r!.mmPerPx).toBe(12);
  });

  it('drops a garbage label but keeps the parseable one', () => {
    const samples: DimSample[] = [
      { text: 'not-a-dim', pixels: 300 },
      { text: '3600', pixels: 300 },
    ];
    const r = mmPerPxFromDimensions(samples);
    expect(r!.samples).toBe(1);
    expect(r!.mmPerPx).toBe(12);
  });

  it('drops samples with non-positive pixel spans', () => {
    const samples: DimSample[] = [
      { text: '3600', pixels: 0 },
      { text: '3600', pixels: -50 },
      { text: '3600', pixels: 300 },
    ];
    const r = mmPerPxFromDimensions(samples);
    expect(r!.samples).toBe(1);
    expect(r!.mmPerPx).toBe(12);
  });

  it('returns null when nothing parses', () => {
    expect(mmPerPxFromDimensions([{ text: 'xx', pixels: 300 }])).toBeNull();
    expect(mmPerPxFromDimensions([])).toBeNull();
  });

  it('takes the MEDIAN across 3 samples (ignores an outlier)', () => {
    // ratios: 12, 12, 100 -> median 12 (outlier discarded by median)
    const samples: DimSample[] = [
      { text: '3600', pixels: 300 }, // 12
      { text: '3.6m', pixels: 300 }, // 12
      { text: '5000', pixels: 50 }, // 100 (outlier)
    ];
    const r = mmPerPxFromDimensions(samples);
    expect(r!.samples).toBe(3);
    expect(r!.mmPerPx).toBe(12);
  });

  it('averages the two central ratios for an even count', () => {
    // ratios sorted: 10, 14 -> median (10+14)/2 = 12
    const samples: DimSample[] = [
      { text: '3000', pixels: 300 }, // 10
      { text: '4200', pixels: 300 }, // 14
    ];
    const r = mmPerPxFromDimensions(samples);
    expect(r!.samples).toBe(2);
    expect(r!.mmPerPx).toBe(12);
  });
});
