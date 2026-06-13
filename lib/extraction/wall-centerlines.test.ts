import { describe, it, expect } from 'vitest';
import { collapseDoubleWalls } from './wall-centerlines';
import type { WallLine } from './rooms-from-walls';

const v = (coord: number, lo: number, hi: number): WallLine => ({ orient: 'v', coord, lo, hi });
const h = (coord: number, lo: number, hi: number): WallLine => ({ orient: 'h', coord, lo, hi });

describe('collapseDoubleWalls', () => {
  it('collapses two parallel overlapping faces into one centerline with thickness', () => {
    const res = collapseDoubleWalls([v(100, 0, 3000), v(215, 0, 3000)]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ orient: 'v', coord: 157.5, lo: 0, hi: 3000, thickness: 115 });
  });

  it('keeps an unpaired single-line wall with the default thickness', () => {
    const res = collapseDoubleWalls([v(500, 0, 2000)], { defaultThickness: 115 });
    expect(res).toEqual([{ orient: 'v', coord: 500, lo: 0, hi: 2000, thickness: 115 }]);
  });

  it('does NOT pair parallels that are too far apart', () => {
    // gap 800 > maxThickness 350 → two separate single walls
    const res = collapseDoubleWalls([v(0, 0, 3000), v(800, 0, 3000)]);
    expect(res).toHaveLength(2);
    expect(res.every((w) => w.thickness === 115)).toBe(true);
  });

  it('does NOT pair parallels that barely overlap lengthwise', () => {
    // close in coord but only touch at one end → not a wall pair
    const res = collapseDoubleWalls([v(100, 0, 1000), v(200, 980, 3000)]);
    expect(res).toHaveLength(2);
  });

  it('collapses horizontal pairs too, taking the union span', () => {
    const res = collapseDoubleWalls([h(50, 0, 4000), h(150, 200, 4200)]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ orient: 'h', coord: 100, lo: 0, hi: 4200, thickness: 100 });
  });

  it('pairs each face once (three close parallels → one pair + one single)', () => {
    const res = collapseDoubleWalls([v(100, 0, 3000), v(210, 0, 3000), v(900, 0, 3000)]);
    // 100+210 pair; 900 stands alone
    expect(res).toHaveLength(2);
    const paired = res.find((w) => w.thickness === 110);
    expect(paired).toMatchObject({ coord: 155 });
    expect(res.find((w) => w.coord === 900)?.thickness).toBe(115);
  });
});
