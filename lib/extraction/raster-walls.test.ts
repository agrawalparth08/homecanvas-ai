import { describe, it, expect } from 'vitest';
import { wallsFromMask, type RasterWallOptions } from './raster-walls';
import { type WallLine } from './rooms-from-walls';

/** Allocate a h×w all-false grid (rows-of-cols). */
function grid(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
}

/** Paint a filled rectangle of wall pixels [x0,x1)×[y0,y1). */
function fillRect(m: boolean[][], x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y]![x] = true;
}

const v = (ws: WallLine[]) => ws.filter((w) => w.orient === 'v').sort((a, b) => a.coord - b.coord);
const h = (ws: WallLine[]) => ws.filter((w) => w.orient === 'h').sort((a, b) => a.coord - b.coord);

describe('wallsFromMask', () => {
  it('vectorizes a hollow rectangle into 2 v + 2 h walls with correct mm spans', () => {
    const mm = 10;
    const m = grid(40, 30);
    // 2px-thick border
    fillRect(m, 0, 0, 40, 2);   // top
    fillRect(m, 0, 28, 40, 30); // bottom
    fillRect(m, 0, 0, 2, 30);   // left
    fillRect(m, 38, 0, 40, 30); // right
    const opts: RasterWallOptions = { mmPerPx: mm, minWallPx: 8 };

    const walls = wallsFromMask(m, opts);
    const vs = v(walls);
    const hs = h(walls);
    expect(vs).toHaveLength(2);
    expect(hs).toHaveLength(2);

    // left band cols {0,1} → centre pixel 1.0; right band {38,39} → 39.0
    expect(vs[0]!.coord).toBe(1.0 * mm);
    expect(vs[1]!.coord).toBe(39.0 * mm);
    // vertical walls span the full height 0..30 px
    expect(vs[0]!.lo).toBe(0);
    expect(vs[0]!.hi).toBe(30 * mm);

    // top band rows {0,1} → 1.0; bottom {28,29} → 29.0
    expect(hs[0]!.coord).toBe(1.0 * mm);
    expect(hs[1]!.coord).toBe(29.0 * mm);
    // horizontal walls span the full width 0..40 px
    expect(hs[0]!.lo).toBe(0);
    expect(hs[0]!.hi).toBe(40 * mm);
  });

  it('returns a single vertical wall for a lone vertical bar', () => {
    const m = grid(20, 20);
    fillRect(m, 10, 2, 12, 18); // 2px-wide bar, 16px tall
    const walls = wallsFromMask(m, { mmPerPx: 5, minWallPx: 8 });
    expect(walls).toHaveLength(1);
    const w = walls[0]!;
    expect(w.orient).toBe('v');
    expect(w.coord).toBe(11.0 * 5); // cols {10,11} → centre 11.0
    expect(w.lo).toBe(2 * 5);
    expect(w.hi).toBe(18 * 5);
  });

  it('ignores noise speckle shorter than minWallPx', () => {
    const m = grid(30, 30);
    fillRect(m, 5, 5, 7, 9);   // 4px-tall fleck, below minWallPx
    fillRect(m, 20, 20, 23, 22); // 2px-tall, 3px-wide fleck
    const walls = wallsFromMask(m, { mmPerPx: 1, minWallPx: 8 });
    expect(walls).toHaveLength(0);
  });

  it('bridges a small doorway gap into one continuous span', () => {
    const m = grid(20, 40);
    // a vertical wall split by a 3px doorway: y 2..16 and y 19..38
    fillRect(m, 8, 2, 10, 16);
    fillRect(m, 8, 19, 10, 38);
    const walls = wallsFromMask(m, { mmPerPx: 1, minWallPx: 8, mergeGapPx: 3 });
    const vs = v(walls);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.lo).toBe(2);
    expect(vs[0]!.hi).toBe(38);
  });

  it('does NOT bridge a gap wider than mergeGapPx', () => {
    const m = grid(20, 40);
    fillRect(m, 8, 2, 10, 12);  // y 2..12
    fillRect(m, 8, 20, 10, 30); // y 20..30, gap of 8px
    const walls = wallsFromMask(m, { mmPerPx: 1, minWallPx: 8, mergeGapPx: 3 });
    const vs = v(walls);
    expect(vs).toHaveLength(2);
  });

  it('rejects a filled blob wider than the band cap (not a thin wall)', () => {
    const m = grid(80, 80);
    fillRect(m, 10, 10, 70, 70); // 60×60 solid region
    const walls = wallsFromMask(m, { mmPerPx: 1, minWallPx: 8 });
    // each column/row run is long enough, but the band width > MAX_BAND_PX → dropped
    expect(walls).toHaveLength(0);
  });

  it('returns [] for an empty mask', () => {
    expect(wallsFromMask([], { mmPerPx: 10 })).toEqual([]);
    expect(wallsFromMask([[]], { mmPerPx: 10 })).toEqual([]);
  });
});
