import { describe, expect, it } from 'vitest';
import { parseDimension, parsePlanText } from './ocr';

describe('parseDimension', () => {
  it('parses feet-inches and plain mm, rejects words', () => {
    expect(parseDimension("12'6\"")).toBeCloseTo((12 * 12 + 6) * 25.4, 3);
    expect(parseDimension('2743')).toBe(2743);
    expect(parseDimension('2,743 mm')).toBe(2743);
    expect(parseDimension('KITCHEN')).toBeNull();
    expect(parseDimension('7')).toBeNull(); // single digit, not a dimension
  });
});

describe('parsePlanText', () => {
  it('separates labels from dimensions by position', () => {
    const items = [
      { text: 'GUEST ROOM', x: 10, y: 10 },
      { text: '2743', x: 20, y: 30 },
      { text: "12'6\"", x: 40, y: 50 },
      { text: '·', x: 0, y: 0 },
    ];
    const out = parsePlanText(items);
    expect(out.labels.map((l) => l.text)).toEqual(['GUEST ROOM']);
    expect(out.dimensions.map((d) => d.value)).toEqual([2743, (12 * 12 + 6) * 25.4]);
  });
});
