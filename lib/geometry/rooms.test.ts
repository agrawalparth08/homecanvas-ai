import { describe, expect, it } from 'vitest';
import { centroid, pointInPolygon, polygonArea, sanitizeBoundary, signedArea } from './rooms';

const square = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];

describe('room polygon utilities', () => {
  it('computes areas and centroids', () => {
    expect(polygonArea(square)).toBe(1_000_000);
    expect(centroid(square)).toEqual({ x: 500, y: 500 });
    expect(signedArea(square)).toBeGreaterThan(0); // CCW
  });

  it('point-in-polygon', () => {
    expect(pointInPolygon({ x: 500, y: 500 }, square)).toBe(true);
    expect(pointInPolygon({ x: 1500, y: 500 }, square)).toBe(false);
  });

  it('sanitize fixes winding and deduplicates points', () => {
    const messy = {
      outer: [...square].reverse(), // CW outer
      holes: [
        [
          { x: 200, y: 200 },
          { x: 200, y: 200.1 }, // near-duplicate
          { x: 400, y: 200 },
          { x: 400, y: 400 },
          { x: 200, y: 400 },
        ],
      ],
    };
    const clean = sanitizeBoundary(messy);
    expect(signedArea(clean.outer)).toBeGreaterThan(0); // outer forced CCW
    expect(signedArea(clean.holes[0]!)).toBeLessThan(0); // hole forced CW
    expect(clean.holes[0]!).toHaveLength(4);
  });

  it('sanitize drops collapsed holes', () => {
    const clean = sanitizeBoundary({
      outer: square,
      holes: [[{ x: 1, y: 1 }, { x: 1.1, y: 1 }, { x: 1, y: 1.1 }]],
    });
    expect(clean.holes).toHaveLength(0);
  });
});
