import { describe, expect, it } from 'vitest';
import { detectRooms, type WallLine } from './rooms-from-walls';

// outer rectangle [0,0,W,H] plus the listed interior walls.
function frame(W: number, H: number, extra: WallLine[]): WallLine[] {
  return [
    { orient: 'v', coord: 0, lo: 0, hi: H },
    { orient: 'v', coord: W, lo: 0, hi: H },
    { orient: 'h', coord: 0, lo: 0, hi: W },
    { orient: 'h', coord: H, lo: 0, hi: W },
    ...extra,
  ];
}

describe('detectRooms', () => {
  it('splits a box into two rooms by a mid wall', () => {
    const walls = frame(200, 100, [{ orient: 'v', coord: 100, lo: 0, hi: 100 }]);
    const rooms = detectRooms(walls);
    expect(rooms).toEqual([
      { x0: 0, y0: 0, x1: 100, y1: 100 },
      { x0: 100, y0: 0, x1: 200, y1: 100 },
    ]);
  });

  it('finds four quadrant rooms from a cross of walls', () => {
    const walls = frame(200, 200, [
      { orient: 'v', coord: 100, lo: 0, hi: 200 },
      { orient: 'h', coord: 100, lo: 0, hi: 200 },
    ]);
    expect(detectRooms(walls)).toHaveLength(4);
  });

  it('treats an open (un-walled) region as exterior, not a room', () => {
    // bottom edge of the right half is missing → that cell escapes to outside
    const walls: WallLine[] = [
      { orient: 'v', coord: 0, lo: 0, hi: 100 },
      { orient: 'v', coord: 100, lo: 0, hi: 100 },
      { orient: 'v', coord: 200, lo: 0, hi: 100 },
      { orient: 'h', coord: 100, lo: 0, hi: 200 }, // top spans both
      { orient: 'h', coord: 0, lo: 0, hi: 100 }, // bottom only under the LEFT half
    ];
    const rooms = detectRooms(walls);
    expect(rooms).toEqual([{ x0: 0, y0: 0, x1: 100, y1: 100 }]); // only the enclosed left room
  });

  it('drops slivers below minArea', () => {
    const walls = frame(200, 100, [{ orient: 'v', coord: 5, lo: 0, hi: 100 }]); // 5-wide sliver + main
    const rooms = detectRooms(walls, { minArea: 1000 });
    expect(rooms).toEqual([{ x0: 5, y0: 0, x1: 200, y1: 100 }]);
  });
});
