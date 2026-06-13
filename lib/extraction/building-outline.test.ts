import { describe, expect, it } from 'vitest';
import { computeOutline, detectRoomsSealed } from './building-outline';
import { detectRooms, type WallLine } from './rooms-from-walls';

// An open building shell: 3 of the 4 perimeter edges plus one full-height
// interior divider at x=100. The BOTTOM edge (y=0) is missing entirely — the
// real-CAD failure mode where door/window openings break the outer wall — so
// every interior cell leaks straight out to the exterior under plain detection.
function openShellWithDivider(): WallLine[] {
  const W = 200, H = 100;
  return [
    { orient: 'v', coord: 0, lo: 0, hi: H },     // left
    { orient: 'v', coord: W, lo: 0, hi: H },     // right
    { orient: 'h', coord: H, lo: 0, hi: W },     // top
    // bottom (y=0) intentionally absent → the gap
    { orient: 'v', coord: 100, lo: 0, hi: H },   // interior divider
  ];
}

describe('computeOutline', () => {
  it('returns the footprint bbox over all wall extents', () => {
    expect(computeOutline(openShellWithDivider())).toEqual({ x0: 0, y0: 0, x1: 200, y1: 100 });
  });
});

describe('detectRoomsSealed', () => {
  it('finds the 2 enclosed rooms where plain detectRooms leaks them out', () => {
    const walls = openShellWithDivider();

    // Baseline: the missing bottom edge lets both interior cells escape to the
    // exterior, so plain detection recovers at most one room (here zero).
    const leaked = detectRooms(walls);
    expect(leaked.length).toBeLessThanOrEqual(1);

    // Sealing the perimeter re-closes the footprint; both halves become rooms.
    const sealed = detectRoomsSealed(walls);
    expect(sealed).toEqual([
      { x0: 0, y0: 0, x1: 100, y1: 100 },
      { x0: 100, y0: 0, x1: 200, y1: 100 },
    ]);
  });

  it('passes through opts (minArea) to the underlying detector', () => {
    // a thin 5-wide sliver on the left + the main right room; minArea drops the sliver.
    const walls: WallLine[] = [
      { orient: 'v', coord: 0, lo: 0, hi: 100 },
      { orient: 'v', coord: 5, lo: 0, hi: 100 },
      { orient: 'v', coord: 200, lo: 0, hi: 100 },
      { orient: 'h', coord: 100, lo: 0, hi: 200 }, // top only → bottom sealed by outline
    ];
    const sealed = detectRoomsSealed(walls, { minArea: 1000 });
    expect(sealed).toEqual([{ x0: 5, y0: 0, x1: 200, y1: 100 }]);
  });
});
