import { applyPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from './commit';
import { makePatch } from './patching';
import type { HomeScene } from './schemas';

/**
 * duplicate_floor / remove_floor (tower & multi-unit workflows): every entity
 * id on the clone is re-minted, internal references stay consistent, and the
 * immer undo patches restore the original scene exactly.
 */

const dup = (scene: HomeScene, floorId: string, newFloorId = 'floor-copy', level = 99) =>
  commit(scene, makePatch('dup', [{ type: 'duplicate_floor', floorId, newFloorId, name: 'Tower Level', level }]));

describe('duplicate_floor', () => {
  it('clones with fresh ids and consistent internal references', () => {
    const scene = buildSampleHome();
    const src = scene.floors[0]!;
    const result = commit(scene, makePatch('dup', [
      { type: 'duplicate_floor', floorId: src.id, newFloorId: 'floor-copy', name: 'Level 2', level: 99 },
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const next = result.scene;
    expect(next.floors).toHaveLength(scene.floors.length + 1);
    const clone = next.floors.find((f) => f.id === 'floor-copy')!;
    expect(clone.name).toBe('Level 2');
    expect(clone.rooms).toHaveLength(src.rooms.length);
    expect(clone.walls).toHaveLength(src.walls.length);
    expect(clone.objects).toHaveLength(src.objects.length);

    // No id collisions anywhere in the scene.
    const ids = next.floors.flatMap((f) => [
      f.id,
      ...f.rooms.map((r) => r.id),
      ...f.walls.map((w) => w.id),
      ...f.openings.map((o) => o.id),
      ...f.objects.map((o) => o.id),
      ...f.stairs.map((s) => s.id),
      ...f.lights.map((l) => l.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);

    // References landed on the clone's own entities.
    const cloneWallIds = new Set(clone.walls.map((w) => w.id));
    const cloneRoomIds = new Set(clone.rooms.map((r) => r.id));
    const cloneObjectIds = new Set(clone.objects.map((o) => o.id));
    for (const opening of clone.openings) expect(cloneWallIds.has(opening.wallId)).toBe(true);
    for (const obj of clone.objects) expect(cloneRoomIds.has(obj.roomId)).toBe(true);
    for (const room of clone.rooms) for (const fid of room.furnitureIds) expect(cloneObjectIds.has(fid)).toBe(true);
    for (const wall of clone.walls) expect(wall.floorId).toBe('floor-copy');
    for (const stair of clone.stairs) {
      expect(stair.floorId).toBe('floor-copy');
      expect(stair.crossFloorLink).toBeUndefined();
    }
    // Source floor untouched.
    expect(next.floors.find((f) => f.id === src.id)!.rooms.map((r) => r.id)).toEqual(src.rooms.map((r) => r.id));
  });

  it('rejects id and level collisions', () => {
    const scene = buildSampleHome();
    const src = scene.floors[0]!;
    expect(dup(scene, src.id, src.id, 99).ok).toBe(false);
    expect(dup(scene, src.id, 'floor-copy', scene.floors[1]?.level ?? src.level).ok).toBe(false);
    expect(dup(scene, 'no-such-floor').ok).toBe(false);
  });

  it('undo patches restore the original scene', () => {
    const scene = buildSampleHome();
    const result = dup(scene, scene.floors[0]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = applyPatches(result.scene, result.entry.undo) as HomeScene;
    expect(restored.floors.map((f) => f.id)).toEqual(scene.floors.map((f) => f.id));
  });
});

describe('remove_floor', () => {
  it('removes a floor but never the last one', () => {
    const scene = buildSampleHome();
    if (scene.floors.length < 2) throw new Error('fixture needs 2+ floors');
    const removed = commit(scene, makePatch('rm', [{ type: 'remove_floor', floorId: scene.floors[1]!.id }]));
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.scene.floors).toHaveLength(scene.floors.length - 1);

    let last: HomeScene = removed.scene;
    while (last.floors.length > 1) {
      const step = commit(last, makePatch('rm', [{ type: 'remove_floor', floorId: last.floors[last.floors.length - 1]!.id }]));
      if (!step.ok) throw new Error('unexpected removal failure');
      last = step.scene;
    }
    expect(commit(last, makePatch('rm', [{ type: 'remove_floor', floorId: last.floors[0]!.id }])).ok).toBe(false);
  });
});
