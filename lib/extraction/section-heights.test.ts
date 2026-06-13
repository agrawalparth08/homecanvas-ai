import { describe, it, expect } from 'vitest';
import { parseSectionHeights } from './section-heights';

/** Build horizontal section lines at the given y coordinates. */
function hLines(ys: number[]) {
  return ys.map((y) => ({ y, x0: 0, x1: 100 }));
}

describe('parseSectionHeights', () => {
  it('derives storey height from evenly spaced levels (y=0,2800,5600)', () => {
    const out = parseSectionHeights({ texts: [], hLines: hLines([0, 2800, 5600]) });
    expect(out.storeyHeightMm).toBe(2800);
    expect(out.levelYs).toEqual([0, 2800, 5600]);
    expect(out.parapetMm).toBeUndefined();
  });

  it('sorts levels ascending regardless of input line order', () => {
    const out = parseSectionHeights({ texts: [], hLines: hLines([5600, 0, 2800]) });
    expect(out.levelYs).toEqual([0, 2800, 5600]);
  });

  it('clusters near-coincident lines (double-drawn floor/slab) into one level', () => {
    const out = parseSectionHeights(
      { texts: [], hLines: hLines([0, 1.5, 2800, 2801, 5600]) },
      { clusterTolerance: 5 },
    );
    expect(out.levelYs.length).toBe(3);
    expect(out.storeyHeightMm).toBeCloseTo(2800, 0);
  });

  it('refines storey height with a plain-mm dimension text (3050)', () => {
    const geom = parseSectionHeights({ texts: [], hLines: hLines([0, 2800, 5600]) });
    const refined = parseSectionHeights({
      texts: [{ text: '3050', x: 10, y: 1400 }],
      hLines: hLines([0, 2800, 5600]),
    });
    // 3050 annotation pulls the 2800 geometric estimate upward, toward 3050.
    expect(refined.storeyHeightMm).toBeGreaterThan(geom.storeyHeightMm);
    expect(refined.storeyHeightMm).toBe((2800 + 3050) / 2);
    expect(refined.storeyHeightMm).toBeLessThanOrEqual(3050);
  });

  it('scales raw drawing units by mmPerUnit', () => {
    // Levels in arbitrary units; mmPerUnit converts 0,28,56 → 2800 storey.
    const out = parseSectionHeights(
      { texts: [], hLines: hLines([0, 28, 56]) },
      { mmPerUnit: 100 },
    );
    expect(out.storeyHeightMm).toBe(2800);
  });

  it("refines with a feet-inches dimension text (10'0)", () => {
    // 10'0" = 3048mm; averaged with a 3000mm geometric storey.
    const out = parseSectionHeights({
      texts: [{ text: "10'0", x: 5, y: 1500 }],
      hLines: hLines([0, 3000, 6000]),
    });
    expect(out.storeyHeightMm).toBeCloseTo((3000 + 3048) / 2, 1);
  });

  it('reports a short top level as the parapet', () => {
    // Two full 2800 storeys then a short 900-tall parapet above the roof.
    const out = parseSectionHeights({ texts: [], hLines: hLines([0, 2800, 5600, 6500]) });
    expect(out.storeyHeightMm).toBe(2800);
    expect(out.parapetMm).toBe(900);
  });

  it('handles a single level (no spacing) without crashing', () => {
    const out = parseSectionHeights({ texts: [], hLines: hLines([1200]) });
    expect(out.storeyHeightMm).toBe(0);
    expect(out.levelYs).toEqual([1200]);
    expect(out.parapetMm).toBeUndefined();
  });

  it('falls back to the annotated height when there is no geometry', () => {
    const out = parseSectionHeights({ texts: [{ text: '2700', x: 0, y: 0 }], hLines: [] });
    expect(out.storeyHeightMm).toBe(2700);
    expect(out.levelYs).toEqual([]);
  });
});
