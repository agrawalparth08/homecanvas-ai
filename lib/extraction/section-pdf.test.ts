import { describe, it, expect } from 'vitest';
import { sectionInputFromSegments, type RawSeg, type RawText } from './section-pdf';
import { parseSectionHeights } from './section-heights';

describe('sectionInputFromSegments', () => {
  it('keeps horizontal level lines, drops diagonals and short stubs', () => {
    const segs: RawSeg[] = [
      // three clean horizontal level lines at y = 0, 300, 600
      { x0: 10, y0: 0, x1: 110, y1: 0 },
      { x0: 10, y0: 300, x1: 110, y1: 300 },
      { x0: 10, y0: 600, x1: 110, y1: 600 },
      // steep diagonals (roof / stair slopes) — large vertical drift
      { x0: 10, y0: 0, x1: 110, y1: 250 },
      { x0: 0, y0: 600, x1: 60, y1: 300 },
    ];
    const out = sectionInputFromSegments(segs, []);
    expect(out.hLines).toHaveLength(3);
    expect(out.hLines.map((l) => l.y)).toEqual([0, 300, 600]);
    // x extent is normalised (min, max).
    expect(out.hLines[0]).toEqual({ y: 0, x0: 10, x1: 110 });
  });

  it('drops a too-short horizontal segment and reversed-coordinate stubs', () => {
    const segs: RawSeg[] = [
      { x0: 0, y0: 100, x1: 100, y1: 100 }, // long enough → kept
      { x0: 0, y0: 200, x1: 5, y1: 200 }, // span 5 < default minLen 20 → dropped
      { x0: 200, y0: 50, x1: 190, y1: 50 }, // span 10 < 20 → dropped
    ];
    const out = sectionInputFromSegments(segs, []);
    expect(out.hLines).toHaveLength(1);
    expect(out.hLines[0]).toEqual({ y: 100, x0: 0, x1: 100 });
  });

  it('maps text items through and drops empty/whitespace strings', () => {
    const texts: RawText[] = [
      { str: "10'0\"", x: 5, y: 150 },
      { str: '   ', x: 9, y: 9 }, // whitespace-only → dropped
      { str: '', x: 1, y: 1 }, // empty → dropped
      { str: '3050', x: 7, y: 450 },
    ];
    const out = sectionInputFromSegments([], texts);
    expect(out.texts).toEqual([
      { text: "10'0\"", x: 5, y: 150 },
      { text: '3050', x: 7, y: 450 },
    ]);
  });

  it('honours custom horizTol and minLen options', () => {
    const segs: RawSeg[] = [
      { x0: 0, y0: 0, x1: 30, y1: 2 }, // drift 2 > tol 1 → dropped under tight tol
      { x0: 0, y0: 50, x1: 30, y1: 50.5 }, // drift 0.5 <= 1, span 30 >= 25 → kept
    ];
    const out = sectionInputFromSegments(segs, [], { horizTol: 1, minLen: 25 });
    expect(out.hLines).toHaveLength(1);
    expect(out.hLines[0]?.y).toBeCloseTo(50.25);
  });

  it('feeds into parseSectionHeights to recover the ~300-unit storey height', () => {
    // Levels every 300 units → storey spacing 300mm (mmPerUnit defaults to 1).
    const segs: RawSeg[] = [
      { x0: 0, y0: 0, x1: 100, y1: 0 },
      { x0: 0, y0: 300, x1: 100, y1: 0.5 + 299.5 }, // slight drift, still horizontal
      { x0: 0, y0: 600, x1: 100, y1: 600 },
    ];
    const input = sectionInputFromSegments(segs, []);
    const heights = parseSectionHeights(input);
    expect(heights.levelYs).toEqual([0, 300, 600]);
    expect(heights.storeyHeightMm).toBeCloseTo(300);
  });
});
