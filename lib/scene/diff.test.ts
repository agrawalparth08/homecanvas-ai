import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { placeFurnitureInRoom } from '../furniture/catalog';
import { commit } from './commit';
import { diffScenes } from './diff';
import { makePatch } from './patching';
import { SceneDiffSchema, type HomeScene } from './schemas';

const commitOrThrow = (scene: ReturnType<typeof buildSampleHome>, patch: Parameters<typeof commit>[1]) => {
  const r = commit(scene, patch);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};

describe('diffScenes', () => {
  it('identical scenes → empty diff', () => {
    const s = buildSampleHome();
    const d = diffScenes(s, s);
    expect(d.changedRooms).toEqual([]);
    expect(d.addedObjectIds).toEqual([]);
    expect(d.removedObjectIds).toEqual([]);
    expect(d.summary).toBe('No differences.');
    expect(SceneDiffSchema.safeParse(d).success).toBe(true);
  });

  it('recolouring a room floor reports that room as changed + recoloured', () => {
    const s = buildSampleHome();
    const roomId = s.floors[0]!.rooms[0]!.id;
    const next = commitOrThrow(s, makePatch('recolor', [
      { type: 'set_surface_color', surface: { kind: 'roomFloor', roomId }, color: '#abcdef' },
    ], 'user'));
    const d = diffScenes(s, next);
    expect(d.recoloredRooms).toContain(roomId);
    expect(d.changedRooms).toContain(roomId);
  });

  it('adding furniture shows up in addedObjectIds', () => {
    const s = buildSampleHome();
    const room = s.floors.flatMap((f) => f.rooms).sort((a, b) => {
      const area = (r: typeof a) => {
        const xs = r.boundary.outer.map((p) => p.x);
        const ys = r.boundary.outer.map((p) => p.y);
        return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      };
      return area(b) - area(a);
    })[0]!;
    const obj = placeFurnitureInRoom({ id: 'diff-plant', roomId: room.id, key: 'plant', roomOuter: room.boundary.outer, existing: [] })!;
    const next = commitOrThrow(s, makePatch('add', [{ type: 'place_furniture', object: obj }], 'user'));
    const d = diffScenes(s, next);
    expect(d.addedObjectIds).toContain('diff-plant');
    expect(d.removedObjectIds).toEqual([]);
  });

  it('removing furniture shows up in removedObjectIds', () => {
    const s = buildSampleHome();
    const obj = s.floors.flatMap((f) => f.objects)[0]!;
    const next = commitOrThrow(s, makePatch('remove', [{ type: 'remove_object', objectId: obj.id }], 'user'));
    const d = diffScenes(s, next);
    expect(d.removedObjectIds).toContain(obj.id);
  });

  it('reports moved furniture (a layout edit), not as add/remove', () => {
    const s = buildSampleHome();
    const obj = s.floors.flatMap((f) => f.objects)[0]!;
    const next = commitOrThrow(
      s,
      makePatch('move', [{ type: 'transform_object', objectId: obj.id, transform: { x: obj.transform.x + 500 } }], 'user'),
    );
    const d = diffScenes(s, next);
    expect(d.movedObjectIds).toContain(obj.id);
    expect(d.addedObjectIds).toEqual([]);
    expect(d.removedObjectIds).toEqual([]);
  });

  it('reports added and removed rooms (not silently identical)', () => {
    const s = buildSampleHome();
    const removed = JSON.parse(JSON.stringify(s)) as HomeScene;
    const goneId = removed.floors[0]!.rooms[0]!.id;
    removed.floors[0]!.rooms.splice(0, 1);
    expect(diffScenes(s, removed).removedRoomIds).toContain(goneId);
    expect(diffScenes(s, removed).summary).not.toBe('No differences.');

    const added = JSON.parse(JSON.stringify(s)) as HomeScene;
    added.floors[0]!.rooms.push({ ...added.floors[0]!.rooms[0]!, id: 'brand-new-room' });
    expect(diffScenes(s, added).addedRoomIds).toContain('brand-new-room');
  });
});
