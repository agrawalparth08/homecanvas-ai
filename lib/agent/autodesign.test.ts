import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from '../scene/commit';
import { designRoomPatch } from './autodesign';

describe('designRoomPatch', () => {
  it('auto-designs a room into a committable style + furniture patch', () => {
    const scene = buildSampleHome();
    const room = scene.floors.flatMap((f) => f.rooms).find((r) => r.kind === 'living') ?? scene.floors[0]!.rooms[0]!;
    const patch = designRoomPatch(scene, room);
    expect(patch).not.toBeNull();
    expect(patch!.ops.some((o) => o.type === 'place_furniture')).toBe(true);
    expect(patch!.ops.some((o) => o.type === 'assign_material_to_surface')).toBe(true);
    expect(commit(scene, patch!).ok).toBe(true);
  });

  it('produces a committable design for every room kind in the sample', () => {
    for (const room of buildSampleHome().floors.flatMap((f) => f.rooms)) {
      const patch = designRoomPatch(buildSampleHome(), room);
      if (patch) expect(commit(buildSampleHome(), patch).ok, room.kind).toBe(true);
    }
  });

  it('can be re-run on the same (already-designed) room without an id collision', () => {
    const scene = buildSampleHome();
    const room = scene.floors.flatMap((f) => f.rooms).find((r) => r.kind === 'living') ?? scene.floors[0]!.rooms[0]!;
    const r1 = commit(scene, designRoomPatch(scene, room)!);
    if (!r1.ok) throw new Error(JSON.stringify(r1.errors));
    const patch2 = designRoomPatch(r1.scene, room); // re-run on the MUTATED scene
    expect(patch2).not.toBeNull();
    expect(commit(r1.scene, patch2!).ok).toBe(true);
  });

  it('returns null (no rejecting patch) for a locked room', () => {
    const base = buildSampleHome();
    const room = base.floors[0]!.rooms[0]!;
    const locked = { ...base, locks: [{ id: 'lk', entityIds: [room.id], createdAt: '2026-06-12T00:00:00.000Z' }] };
    expect(designRoomPatch(locked, room)).toBeNull();
  });
});
