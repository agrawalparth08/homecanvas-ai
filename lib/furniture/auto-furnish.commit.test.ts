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
