import { describe, it, expect } from 'vitest';
import { isVectorRich, pdfVectorToPrimitivePlan } from './pdf-vector';
import type { ColorSegment } from '../extraction/color-features';

const seg = (x0: number, y0: number, x1: number, y1: number, color: string): ColorSegment => ({ x0, y0, x1, y1, color });

describe('isVectorRich', () => {
  it('is true for a CAD page: many strokes/paths, no big image', () => {
    expect(isVectorRich({ stroke: 800, path: 1200, image: 0 })).toBe(true);
    expect(isVectorRich({ path: 60 })).toBe(true); // strokes optional
  });

  it('is false for a scanned raster: one image, ~no vectors', () => {
    expect(isVectorRich({ stroke: 0, path: 0, image: 1 })).toBe(false);
    expect(isVectorRich({ image: 1 })).toBe(false);
  });

  it('is false when there are too few vector ops', () => {
    expect(isVectorRich({ stroke: 5, path: 10, image: 0 })).toBe(false);
  });

  it('is false when a big raster image is present even with some strokes', () => {
    expect(isVectorRich({ stroke: 200, path: 200, image: 2 })).toBe(false);
  });

  it('handles an empty op-count object', () => {
    expect(isVectorRich({})).toBe(false);
  });
});

describe('pdfVectorToPrimitivePlan', () => {
  it('produces a valid plan with the right wall/opening/column counts', () => {
    const segs: ColorSegment[] = [
      // two black walls (kept per-segment)
      seg(0, 0, 100, 0, '#000000'),
      seg(0, 0, 0, 80, '#000'),
      // one window: four orange ticks across one opening -> clustered to 1
      seg(40, 0, 45, 0, '#ff7f00'),
      seg(45, 0, 50, 0, '#ff7f00'),
      seg(50, 0, 55, 0, '#ff7f00'),
      seg(55, 0, 60, 0, '#ff7f00'),
      // one column: a magenta box drawn as four edges -> clustered to 1
      seg(10, 10, 18, 10, '#ff00ff'),
      seg(18, 10, 18, 18, '#ff00ff'),
      seg(18, 18, 10, 18, '#ff00ff'),
      seg(10, 18, 10, 10, '#ff00ff'),
      // noise that must be ignored
      seg(0, 0, 200, 200, '#3366cc'),
    ];
    const plan = pdfVectorToPrimitivePlan(segs);

    expect(plan.source).toBe('vector-pdf');
    expect(plan.unitsToMm).toBe(1);
    expect(plan.walls).toHaveLength(2);
    expect(plan.openings).toHaveLength(1);
    expect(plan.columns).toHaveLength(1);

    // wall geometry round-tripped as free a->b segments
    expect(plan.walls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(plan.walls[0]!.b).toEqual({ x: 100, y: 0 });
  });

  it('maps an opening to a window at the midpoint with width = span', () => {
    const segs: ColorSegment[] = [seg(40, 0, 60, 0, '#ff7f00')];
    const plan = pdfVectorToPrimitivePlan(segs);
    expect(plan.openings).toHaveLength(1);
    const o = plan.openings[0]!;
    expect(o.kind).toBe('window');
    expect(o.center).toEqual({ x: 50, y: 0 });
    expect(o.width).toBeCloseTo(20);
  });

  it('maps a column to a positive-footprint box at its centre', () => {
    const segs: ColorSegment[] = [
      seg(10, 10, 20, 10, '#ff00ff'),
      seg(10, 20, 20, 20, '#ff00ff'),
    ];
    const plan = pdfVectorToPrimitivePlan(segs);
    expect(plan.columns).toHaveLength(1);
    const c = plan.columns[0]!;
    expect(c.center).toEqual({ x: 15, y: 15 });
    expect(c.width).toBeGreaterThan(0);
    expect(c.depth).toBeGreaterThan(0);
  });

  it('honours unitsToMm and keeps coords in source units', () => {
    const segs: ColorSegment[] = [seg(0, 0, 100, 0, '#000000')];
    const plan = pdfVectorToPrimitivePlan(segs, { unitsToMm: 16.47 });
    expect(plan.unitsToMm).toBeCloseTo(16.47);
    // geometry stays in SOURCE units (scaling happens downstream in the builder)
    expect(plan.walls[0]!.b.x).toBe(100);
  });

  it('returns an empty-but-valid plan for no segments', () => {
    const plan = pdfVectorToPrimitivePlan([]);
    expect(plan.walls).toHaveLength(0);
    expect(plan.openings).toHaveLength(0);
    expect(plan.columns).toHaveLength(0);
    expect(plan.source).toBe('vector-pdf');
  });
});
