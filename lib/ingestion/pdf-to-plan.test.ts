import { describe, expect, it } from 'vitest';
import { primitivePlanFromPdfSegments, type PdfSeg, type PdfText } from './pdf-to-plan';
import { buildSceneFromPrimitives } from '../extraction/build-scene';

// A 600×400 axis-aligned rectangle: 4 long single segments (no double lines, so
// collapseDoubleWalls leaves all 4 intact downstream).
const RECT: PdfSeg[] = [
  { x0: 0, y0: 0, x1: 600, y1: 0 }, // top
  { x0: 600, y0: 0, x1: 600, y1: 400 }, // right
  { x0: 600, y0: 400, x1: 0, y1: 400 }, // bottom
  { x0: 0, y0: 400, x1: 0, y1: 0 }, // left
];

describe('primitivePlanFromPdfSegments', () => {
  it('emits one wall per long segment, drops sub-minLen ticks, maps labels', () => {
    const ticks: PdfSeg[] = [
      { x0: 0, y0: 0, x1: 5, y1: 0 }, // len 5  < 15 → dropped
      { x0: 600, y0: 0, x1: 600, y1: 8 }, // len 8 < 15 → dropped
    ];
    const texts: PdfText[] = [
      { str: 'Bedroom', x: 300, y: 200 },
      { str: '   ', x: 10, y: 10 }, // blank → dropped
      { str: '', x: 0, y: 0 }, // empty → dropped
    ];

    const plan = primitivePlanFromPdfSegments([...RECT, ...ticks], texts);

    expect(plan.source).toBe('vector-pdf');
    expect(plan.walls).toHaveLength(4); // 4 rect sides; both ticks dropped
    expect(plan.labels).toEqual([{ text: 'Bedroom', x: 300, y: 200 }]);
    // walls carry the exact a→b endpoints of their source segments.
    expect(plan.walls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(plan.walls[0]!.b).toEqual({ x: 600, y: 0 });
  });

  it('respects custom minLenPx + unitsToMm and threads colour into layer', () => {
    const segs: PdfSeg[] = [
      { x0: 0, y0: 0, x1: 30, y1: 0, color: '#ff0000' }, // len 30, kept at minLenPx 25
      { x0: 0, y0: 0, x1: 20, y1: 0 }, // len 20 < 25 → dropped
    ];

    const plan = primitivePlanFromPdfSegments(segs, [], { minLenPx: 25, unitsToMm: 2.5 });

    expect(plan.unitsToMm).toBe(2.5);
    expect(plan.walls).toHaveLength(1);
    expect(plan.walls[0]!.layer).toBe('#ff0000');
  });

  it('handles empty input → a valid, empty vector-pdf plan', () => {
    const plan = primitivePlanFromPdfSegments([], []);
    expect(plan.source).toBe('vector-pdf');
    expect(plan.unitsToMm).toBe(1); // default
    expect(plan.walls).toHaveLength(0);
    expect(plan.labels).toHaveLength(0);
  });

  it('end-to-end: the plan builds a scene whose floor carries 4 walls', () => {
    const plan = primitivePlanFromPdfSegments(RECT, [{ str: 'Living', x: 300, y: 200 }]);
    const scene = buildSceneFromPrimitives(plan);

    expect(scene.floors).toHaveLength(1);
    expect(scene.floors[0]!.walls).toHaveLength(4); // single-line rect survives collapseDoubleWalls
  });
});
