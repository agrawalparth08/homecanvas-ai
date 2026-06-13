import { describe, expect, it } from 'vitest';
import { rectFootprint, worldFootprint, convexOverlap } from '../geometry/collision';
import {
  screenToFloor,
  dragSnap,
  type PlacedRect,
  type RoomBounds,
} from './furniture-drag';

const ROOM: RoomBounds = { x0: 0, y0: 0, x1: 5000, y1: 5000 };

/** Lift a snap result back into a world footprint for overlap checks. */
const foot = (c: { x: number; y: number }, w: number, d: number) =>
  worldFootprint({ footprint: rectFootprint(w, d), transform: { x: c.x, y: c.y, rotationY: 0 } });

describe('screenToFloor', () => {
  it('intersects a straight-down ray at the point below the origin', () => {
    const hit = screenToFloor({ x: 1000, y: 2000, z: 3000 }, { x: 0, y: -1, z: 0 }, 0);
    expect(hit).toEqual({ x: 1000, y: 3000 });
  });

  it('maps world.z onto plan.y for an angled ray', () => {
    // origin 1000 above floor, dir descends 1 in y and moves +2 in x, +4 in z
    const hit = screenToFloor({ x: 0, y: 1000, z: 0 }, { x: 2, y: -1, z: 4 }, 0)!;
    expect(hit.x).toBeCloseTo(2000);
    expect(hit.y).toBeCloseTo(4000);
  });

  it('honours a non-zero floor height', () => {
    const hit = screenToFloor({ x: 0, y: 500, z: 0 }, { x: 0, y: -1, z: 0 }, 100)!;
    expect(hit).toEqual({ x: 0, y: 0 });
  });

  it('returns null for a ray parallel to the floor', () => {
    expect(screenToFloor({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 0)).toBeNull();
  });

  it('returns null when the floor is behind the ray (no forward hit)', () => {
    // origin below the floor, ray pointing further down => never reaches floorY
    expect(screenToFloor({ x: 0, y: -10, z: 0 }, { x: 0, y: -1, z: 0 }, 0)).toBeNull();
  });
});

describe('dragSnap clamping', () => {
  it('passes through a target that is already inside and clear', () => {
    expect(dragSnap({ x: 2500, y: 2500 }, { w: 1000, d: 800 }, [], ROOM)).toEqual({ x: 2500, y: 2500 });
  });

  it('clamps a target dragged past the wall back inside the room', () => {
    const snapped = dragSnap({ x: 9000, y: -500 }, { w: 1000, d: 800 }, [], ROOM);
    // centre must keep the half-extents inside the bounds
    expect(snapped.x).toBeCloseTo(ROOM.x1 - 500);
    expect(snapped.y).toBeCloseTo(ROOM.y0 + 400);
  });

  it('centres a piece wider than the room on that axis', () => {
    const narrow: RoomBounds = { x0: 0, y0: 0, x1: 600, y1: 5000 };
    const snapped = dragSnap({ x: 50, y: 2500 }, { w: 1000, d: 500 }, [], narrow);
    expect(snapped.x).toBeCloseTo(300);
  });
});

describe('dragSnap overlap nudging', () => {
  it('nudges the target off an overlapping piece', () => {
    const others: PlacedRect[] = [{ x: 2500, y: 2500, w: 1000, d: 1000, rot: 0 }];
    const snapped = dragSnap({ x: 2500, y: 2500 }, { w: 800, d: 800 }, others, ROOM, { gap: 50 });
    const a = foot(snapped, 800, 800);
    const b = worldFootprint({ footprint: rectFootprint(1000, 1000), transform: { x: 2500, y: 2500, rotationY: 0 } });
    expect(convexOverlap(a, b, 50)).toBe(false);
    // and it stayed inside the room
    expect(snapped.x).toBeGreaterThanOrEqual(ROOM.x0 + 400);
    expect(snapped.x).toBeLessThanOrEqual(ROOM.x1 - 400);
  });

  it('respects a rotated obstacle', () => {
    const others: PlacedRect[] = [{ x: 2500, y: 2500, w: 2000, d: 400, rot: Math.PI / 2 }];
    const snapped = dragSnap({ x: 2500, y: 2500 }, { w: 600, d: 600 }, others, ROOM, { gap: 0 });
    const a = foot(snapped, 600, 600);
    const b = worldFootprint({ footprint: rectFootprint(2000, 400), transform: { x: 2500, y: 2500, rotationY: Math.PI / 2 } });
    expect(convexOverlap(a, b)).toBe(false);
  });

  it('is deterministic for identical inputs', () => {
    const others: PlacedRect[] = [{ x: 2500, y: 2500, w: 1200, d: 1200, rot: 0 }];
    const a = dragSnap({ x: 2500, y: 2500 }, { w: 700, d: 700 }, others, ROOM, { gap: 20 });
    const b = dragSnap({ x: 2500, y: 2500 }, { w: 700, d: 700 }, others, ROOM, { gap: 20 });
    expect(a).toEqual(b);
  });
});
