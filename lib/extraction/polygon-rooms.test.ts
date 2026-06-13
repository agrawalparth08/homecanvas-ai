import { describe, expect, it } from 'vitest';
import { detectRoomsPolygonal, type WallSeg } from './polygon-rooms';

// Build the 4 walls of an axis-aligned box as centerline segments.
function box(x0: number, y0: number, x1: number, y1: number): WallSeg[] {
  return [
    { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
    { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
    { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
    { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
  ];
}

describe('detectRoomsPolygonal', () => {
  it('finds one room for a 3×3 m square (~9e6 mm²)', () => {
    const rooms = detectRoomsPolygonal(box(0, 0, 3000, 3000));
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(9_000_000, 0);
    expect(rooms[0]!.outer).toHaveLength(4);
  });

  it('normalizes the room ring to CCW (positive shoelace)', () => {
    // Feed walls drawn clockwise; output should still be CCW (area>0).
    const cw: WallSeg[] = [
      { a: { x: 0, y: 0 }, b: { x: 0, y: 2000 } },
      { a: { x: 0, y: 2000 }, b: { x: 2000, y: 2000 } },
      { a: { x: 2000, y: 2000 }, b: { x: 2000, y: 0 } },
      { a: { x: 2000, y: 0 }, b: { x: 0, y: 0 } },
    ];
    const rooms = detectRoomsPolygonal(cw);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeGreaterThan(0);
    expect(rooms[0]!.area).toBeCloseTo(4_000_000, 0);
  });

  it('finds two rooms for two unit squares sharing one wall', () => {
    // Two 2×2 m rooms side by side sharing the x=2000 wall.
    const segs: WallSeg[] = [
      ...box(0, 0, 2000, 2000),
      ...box(2000, 0, 4000, 2000),
    ];
    const rooms = detectRoomsPolygonal(segs);
    expect(rooms).toHaveLength(2);
    for (const r of rooms) expect(r.area).toBeCloseTo(4_000_000, 0);
  });

  it('handles a diagonal-cut (triangular) room and reports the right area', () => {
    // Right triangle with legs 4000 mm → area = 0.5*4000*4000 = 8e6 mm².
    const segs: WallSeg[] = [
      { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } },
      { a: { x: 4000, y: 0 }, b: { x: 0, y: 4000 } }, // diagonal hypotenuse
      { a: { x: 0, y: 4000 }, b: { x: 0, y: 0 } },
    ];
    const rooms = detectRoomsPolygonal(segs);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(8_000_000, 0);
    expect(rooms[0]!.outer).toHaveLength(3);
  });

  it('splits a T-junction so the crossing wall closes both sub-rooms', () => {
    // A 4×2 m box with an interior vertical wall at x=2000 that only meets the
    // top/bottom walls mid-span (a T at each end) → two 2×2 rooms.
    const segs: WallSeg[] = [
      ...box(0, 0, 4000, 2000),
      { a: { x: 2000, y: 0 }, b: { x: 2000, y: 2000 } },
    ];
    const rooms = detectRoomsPolygonal(segs);
    expect(rooms).toHaveLength(2);
    for (const r of rooms) expect(r.area).toBeCloseTo(4_000_000, 0);
  });

  it('ignores a stray dangling segment', () => {
    const segs: WallSeg[] = [
      ...box(0, 0, 3000, 3000),
      // a stub poking out of the right wall into empty space — degree-1 dangle
      { a: { x: 3000, y: 1500 }, b: { x: 4200, y: 1500 } },
    ];
    const rooms = detectRoomsPolygonal(segs);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(9_000_000, 0);
  });

  it('snaps near-coincident endpoints within snapTol', () => {
    // Corners are off by ~10 mm; default snapTol=25 should still close the loop.
    const segs: WallSeg[] = [
      { a: { x: 0, y: 0 }, b: { x: 3000, y: 8 } },
      { a: { x: 3000, y: 0 }, b: { x: 3000, y: 3000 } },
      { a: { x: 3000, y: 3000 }, b: { x: 0, y: 3000 } },
      { a: { x: 5, y: 3000 }, b: { x: 0, y: 0 } },
    ];
    const rooms = detectRoomsPolygonal(segs);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeGreaterThan(8_000_000);
  });

  it('drops faces below minArea', () => {
    // One tiny 100×100 mm box (1e4 mm²) below the default 0.9 m² floor.
    const rooms = detectRoomsPolygonal(box(0, 0, 100, 100));
    expect(rooms).toHaveLength(0);
  });

  it('returns [] for empty input', () => {
    expect(detectRoomsPolygonal([])).toEqual([]);
  });
});
