import { describe, expect, it } from 'vitest';
import {
  convexOverlap,
  findPlacement,
  polygonContains,
  rectFootprint,
  swingSector,
  worldFootprint,
} from './collision';

const rectAt = (x: number, y: number, w: number, d: number, rot = 0) =>
  worldFootprint({ footprint: rectFootprint(w, d), transform: { x, y, rotationY: rot } });

const ROOM = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 4000 },
  { x: 0, y: 4000 },
];

describe('convexOverlap', () => {
  it('detects overlapping rectangles', () => {
    expect(convexOverlap(rectAt(0, 0, 1000, 1000), rectAt(500, 0, 1000, 1000))).toBe(true);
  });
  it('separates rectangles that are clearly apart', () => {
    expect(convexOverlap(rectAt(0, 0, 1000, 1000), rectAt(2000, 0, 1000, 1000))).toBe(false);
  });
  it('honours a clearance gap (200mm apart)', () => {
    const a = rectAt(0, 0, 1000, 1000); // right edge x=500
    const b = rectAt(1200, 0, 1000, 1000); // left edge x=700 => 200mm apart
    expect(convexOverlap(a, b, 150)).toBe(false); // 150 clearance satisfied
    expect(convexOverlap(a, b, 300)).toBe(true); // 300 clearance violated
  });
  it('detects overlap for rotated rectangles (OBB via SAT)', () => {
    expect(convexOverlap(rectAt(0, 0, 1400, 200), rectAt(0, 0, 1400, 200, Math.PI / 4))).toBe(true);
  });
});

describe('polygonContains', () => {
  it('is true when fully inside', () => {
    expect(polygonContains(ROOM, rectAt(2000, 2000, 1000, 1000))).toBe(true);
  });
  it('is false when poking through a wall', () => {
    expect(polygonContains(ROOM, rectAt(3800, 2000, 1000, 1000))).toBe(false);
  });
});

describe('findPlacement', () => {
  it('finds a spot in an empty room', () => {
    expect(findPlacement(ROOM, 1000, 800, [])).not.toBeNull();
  });
  it('is deterministic', () => {
    expect(findPlacement(ROOM, 1000, 800, [])).toEqual(findPlacement(ROOM, 1000, 800, []));
  });
  it('returns null when the piece is bigger than the room', () => {
    expect(findPlacement(ROOM, 5000, 5000, [])).toBeNull();
  });
  it('never returns a spot that overlaps an obstacle', () => {
    const obstacle = rectAt(2000, 2000, 2400, 2400);
    const spot = findPlacement(ROOM, 600, 600, [obstacle], { gap: 50, margin: 50, step: 200 });
    expect(spot).not.toBeNull(); // must actually find a corner spot, not skip vacuously
    expect(convexOverlap(rectAt(spot!.x, spot!.y, 600, 600), obstacle, 50)).toBe(false);
  });
});

describe('swingSector', () => {
  it('builds a fan anchored at the hinge with arc points on the radius', () => {
    const r = 900;
    const poly = swingSector({ x: 0, y: 0 }, r, 0, Math.PI / 2, 4);
    expect(poly[0]).toEqual({ x: 0, y: 0 });
    expect(poly).toHaveLength(6); // hinge + (segments + 1) arc points
    // first arc point at startAngle=0 -> (r, 0); last at +π/2 -> (0, r)
    expect(poly[1]!.x).toBeCloseTo(r, 6);
    expect(poly[1]!.y).toBeCloseTo(0, 6);
    expect(poly[5]!.x).toBeCloseTo(0, 6);
    expect(poly[5]!.y).toBeCloseTo(r, 6);
  });
});
