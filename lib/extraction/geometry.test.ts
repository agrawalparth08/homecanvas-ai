import { describe, expect, it } from 'vitest';
import { clusterLines, snapValue, quantize, mergeBoxes, matchWindowToWall, type WallSegLite } from './geometry';

describe('clusterLines', () => {
  it('merges wall-face pairs by length weight and drops faint lines', () => {
    const lines = [
      { coord: 100, len: 200 }, { coord: 104, len: 180 }, // one wall (two faces)
      { coord: 300, len: 220 }, // another wall
      { coord: 500, len: 10 }, // faint — dropped by minTotalLen
    ];
    expect(clusterLines(lines, 6, 60)).toEqual([102, 300]);
  });
});

describe('snapValue', () => {
  it('snaps to the nearest line within tolerance, else unchanged', () => {
    expect(snapValue(247, [132, 248, 446], 30)).toBe(248);
    expect(snapValue(247, [132, 446], 30)).toBe(247); // nothing within 30
  });
});

describe('quantize', () => {
  it('collapses near-coincident edges to one shared value', () => {
    const m = quantize([100, 103, 240, 600, 605], 8);
    expect(m.get(100)).toBe(m.get(103)); // merged
    expect(m.get(600)).toBe(m.get(605)); // merged
    expect(m.get(240)).toBe(240); // alone
    expect(m.get(100)).not.toBe(m.get(240));
  });
});

describe('mergeBoxes', () => {
  it('unions boxes within the gap into pillars', () => {
    const boxes = [
      { x0: 0, y0: 0, x1: 10, y1: 40 }, // left face
      { x0: 30, y0: 0, x1: 40, y1: 40 }, // right face (gap 20)
      { x0: 0, y0: 0, x1: 40, y1: 5 }, // bottom
      { x0: 500, y0: 500, x1: 510, y1: 540 }, // far away → its own box
    ];
    const merged = mergeBoxes(boxes, 25);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ x0: 0, y0: 0, x1: 40, y1: 40 });
  });
});

describe('matchWindowToWall', () => {
  const segs: WallSegLite[] = [
    { orient: 'v', coord: 0, lo: 0, hi: 5000, sideA: 'room', sideB: null }, // exterior west wall
    { orient: 'v', coord: 60, lo: 0, hi: 5000, sideA: 'room', sideB: 'other' }, // interior wall nearby
    { orient: 'h', coord: 0, lo: 0, hi: 4000, sideA: 'room', sideB: null },
  ];
  it('prefers the exterior wall and computes u along it', () => {
    const m = matchWindowToWall({ orient: 'v', coord: 20, lo: 1000, hi: 2500, width: 1500 }, segs);
    expect(m?.seg.coord).toBe(0); // exterior preferred over the closer interior wall
    expect(m?.u).toBeCloseTo((1000 + 2500) / 2 / 5000, 5);
  });
  it('returns null when nothing is close enough', () => {
    expect(matchWindowToWall({ orient: 'v', coord: 9000, lo: 0, hi: 100, width: 900 }, segs)).toBeNull();
  });
});
