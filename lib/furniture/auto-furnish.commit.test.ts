/**
 * Integration: auto-furnish output must survive the REAL commit pipeline (zod
 * validation + lock/reference checks), not just typecheck. The pure unit test
 * proves the layout; this proves the produced FurnitureObjects are committable.
 */
import { describe, it, expect } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { autoFurnishRoom } from './auto-furnish';
import { uniqueFurnitureId } from './catalog';
import { commit } from '../scene/commit';
import { makePatch } from '../scene/patching';
import { polygonContains, worldFootprint, rectFootprint } from '../geometry/collision';
import type { Room } from '../scene/schemas';

/** Largest room on floor 0 — most slots, most pieces. */
function biggestRoom(scene: ReturnType<typeof buildSampleHome>) {
  return scene.floors[0]!.rooms
    .map((r) => {
      const xs = r.boundary.outer.map((p) => p.x);
      const ys = r.boundary.outer.map((p) => p.y);
      const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      return { r, area };
    })
    .sort((a, b) => b.area - a.area)[0]!.r;
}

describe('autoFurnishRoom → commit', () => {
  it('produces pieces that commit cleanly and land in the room', () => {
    const scene = buildSampleHome();
    const room = biggestRoom(scene);
    const floor = scene.floors[0]!;

    const used = new Set(floor.objects.map((o) => o.id));
    const pieces = autoFurnishRoom(room).map((p) => {
      const id = uniqueFurnitureId(used, room.id);
      used.add(id);
      return { ...p, id };
    });
    expect(pieces.length).toBeGreaterThan(0);

    const res = commit(scene, makePatch(`Furnish ${room.name}`, pieces.map((object) => ({ type: 'place_furniture', object }))));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const nextFloor = res.scene.floors[0]!;
    const nextRoom = nextFloor.rooms.find((r) => r.id === room.id)!;
    // every placed piece exists on the floor and is registered to the room
    for (const p of pieces) {
      expect(nextFloor.objects.some((o) => o.id === p.id)).toBe(true);
      expect(nextRoom.furnitureIds).toContain(p.id);
    }
  });
});

describe('autoFurnishRoom — non-rectangular room containment', () => {
  it('never places a piece outside an L-shaped room polygon', () => {
    // 6×6m square with the top-right 3×3m quadrant removed: the bbox overhangs
    // the walls, so a bbox-only packer would float pieces into the missing corner.
    const outer = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 3000 },
      { x: 3000, y: 3000 },
      { x: 3000, y: 6000 },
      { x: 0, y: 6000 },
    ];
    const room = {
      id: 'L',
      floorId: 'f',
      name: 'L room',
      kind: 'living',
      openToSky: false,
      boundary: { outer, holes: [] },
      wallIds: [],
      floorSurface: { id: 'L-floor', parentId: 'L', kind: 'floor', materialId: 'm' },
      furnitureIds: [],
      lightIds: [],
      styleTags: [],
      source: { kind: 'agent', confidence: 1 },
    } as unknown as Room;

    const pieces = autoFurnishRoom(room);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) {
      const foot = worldFootprint({
        footprint: rectFootprint(p.dimensions.w, p.dimensions.d),
        transform: { x: p.transform.x, y: p.transform.y, rotationY: p.transform.rotationY },
      });
      expect(polygonContains(outer, foot)).toBe(true);
    }
  });
});
