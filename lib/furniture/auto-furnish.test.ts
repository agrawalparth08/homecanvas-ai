import { describe, expect, it } from 'vitest';
import { RoomSchema, type Room, type FurnitureObject } from '../scene/schemas';
import { worldFootprint, convexOverlap } from '../geometry/collision';
import { autoFurnishRoom } from './auto-furnish';

/** A fully schema-valid axis-aligned rectangular room, w×d in mm. */
function makeRoom(id: string, w: number, d: number, kind: Room['kind'] = 'living'): Room {
  return RoomSchema.parse({
    id,
    floorId: 'f0',
    name: 'Test Room',
    kind,
    openToSky: false,
    boundary: {
      outer: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
      ],
      holes: [],
    },
    wallIds: [],
    floorSurface: { id: 's0', parentId: id, kind: 'floor', materialId: 'm0' },
    furnitureIds: [],
    lightIds: [],
    styleTags: [],
    source: { kind: 'sample', confidence: 1 },
  });
}

/** Axis-aligned bbox of the room outer (mirrors the module's containment check). */
function outerBbox(room: Room) {
  const xs = room.boundary.outer.map((p) => p.x);
  const ys = room.boundary.outer.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Every footprint vertex sits within [min,max] on both axes (+ tiny epsilon). */
function withinBbox(obj: FurnitureObject, b: ReturnType<typeof outerBbox>): boolean {
  const foot = worldFootprint(obj);
  return foot.every(
    (p) => p.x >= b.minX - 1e-6 && p.x <= b.maxX + 1e-6 && p.y >= b.minY - 1e-6 && p.y <= b.maxY + 1e-6,
  );
}

describe('autoFurnishRoom', () => {
  it('furnishes a 5x4m living room with several non-overlapping in-bbox pieces', () => {
    const room = makeRoom('living-1', 5000, 4000, 'living');
    const out = autoFurnishRoom(room);

    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(6); // default max

    const b = outerBbox(room);
    for (const obj of out) {
      expect(obj.roomId).toBe('living-1');
      expect(obj.source.kind).toBe('agent');
      expect(obj.transform.elevation).toBe(0);
      expect(obj.transform.rotationY).toBe(0);
      expect(withinBbox(obj, b)).toBe(true);
    }

    // Pairwise no-collision, using the same SAT primitive the module relies on.
    const feet = out.map(worldFootprint);
    for (let i = 0; i < feet.length; i++) {
      for (let j = i + 1; j < feet.length; j++) {
        expect(convexOverlap(feet[i]!, feet[j]!, 0)).toBe(false);
      }
    }
  });

  it('respects a custom max and idPrefix', () => {
    const room = makeRoom('living-2', 6000, 5000, 'living');
    const out = autoFurnishRoom(room, { max: 2, idPrefix: 'seed' });

    expect(out.length).toBeLessThanOrEqual(2);
    expect(out.map((o) => o.id)).toEqual(out.map((_, i) => `seed-${i}`));
  });

  it('edge case: a tiny 1x1m room yields 0 or 1 piece, still inside the bbox', () => {
    const room = makeRoom('tiny-1', 1000, 1000, 'living');
    const out = autoFurnishRoom(room);

    expect(out.length).toBeLessThanOrEqual(1);
    const b = outerBbox(room);
    for (const obj of out) expect(withinBbox(obj, b)).toBe(true);
  });

  it('edge case: max <= 0 places nothing', () => {
    const room = makeRoom('zero-1', 5000, 4000, 'living');
    expect(autoFurnishRoom(room, { max: 0 })).toEqual([]);
  });

  it('edge case: a room smaller than the margins on both sides yields nothing', () => {
    // 300x300mm interior with the default 200mm margin leaves negative usable space.
    const room = makeRoom('micro-1', 300, 300, 'living');
    expect(autoFurnishRoom(room)).toEqual([]);
  });

  it('is deterministic: two calls return identical arrays', () => {
    const room = makeRoom('living-3', 5000, 4000, 'living');
    const a = autoFurnishRoom(room);
    const b = autoFurnishRoom(room);
    expect(a).toEqual(b);
    // Deep value equality on the full objects, not just lengths.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('handles a non-living kind (bedroom) without overlaps', () => {
    const room = makeRoom('bed-1', 4000, 4000, 'bedroom');
    const out = autoFurnishRoom(room);
    expect(out.length).toBeGreaterThanOrEqual(1);
    const feet = out.map(worldFootprint);
    for (let i = 0; i < feet.length; i++) {
      for (let j = i + 1; j < feet.length; j++) {
        expect(convexOverlap(feet[i]!, feet[j]!, 0)).toBe(false);
      }
    }
  });
});
