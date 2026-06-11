import { describe, expect, it } from 'vitest';
import { mergeCollinearWalls, snapEndpointsToGrid, healWalls } from './heal-walls';
import { detectRooms, type WallLine } from './rooms-from-walls';

describe('mergeCollinearWalls', () => {
  it('bridges a door gap between collinear segments', () => {
    const walls: WallLine[] = [
      { orient: 'v', coord: 0, lo: 0, hi: 90 },
      { orient: 'v', coord: 2, lo: 110, hi: 200 }, // ~same line (coordTol), 20px gap
    ];
    expect(mergeCollinearWalls(walls)).toEqual([{ orient: 'v', coord: 1, lo: 0, hi: 200 }]);
  });
  it('keeps a large gap as two segments', () => {
    const walls: WallLine[] = [
      { orient: 'h', coord: 0, lo: 0, hi: 100 },
      { orient: 'h', coord: 0, lo: 900, hi: 1000 }, // 800 gap > maxGap
    ];
    expect(mergeCollinearWalls(walls)).toHaveLength(2);
  });
});

describe('snapEndpointsToGrid', () => {
  it('extends an endpoint to meet the perpendicular wall', () => {
    const walls: WallLine[] = [
      { orient: 'v', coord: 0, lo: 0, hi: 95 }, // stops short
      { orient: 'h', coord: 100, lo: 0, hi: 50 },
    ];
    const snapped = snapEndpointsToGrid(walls);
    expect(snapped[0]).toEqual({ orient: 'v', coord: 0, lo: 0, hi: 100 }); // hi 95 -> 100
  });
});

describe('healWalls → detectRooms', () => {
  it('bridges door gaps so a room is detected that otherwise leaked', () => {
    // a closed box whose right wall has a door gap (would leak to outside raw)
    const raw: WallLine[] = [
      { orient: 'v', coord: 0, lo: 0, hi: 100 },
      { orient: 'v', coord: 100, lo: 0, hi: 40 }, // gap 40..70 (door)
      { orient: 'v', coord: 100, lo: 70, hi: 100 },
      { orient: 'h', coord: 0, lo: 0, hi: 100 },
      { orient: 'h', coord: 100, lo: 0, hi: 100 },
    ];
    expect(detectRooms(raw)).toHaveLength(0); // raw leaks
    const healed = healWalls(raw, { maxGap: 60 });
    expect(detectRooms(healed)).toEqual([{ x0: 0, y0: 0, x1: 100, y1: 100 }]);
  });
});
