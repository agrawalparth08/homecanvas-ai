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

  it('auto-deletes existing furniture so a re-design REPLACES instead of stacking', () => {
    const scene = buildSampleHome();
    const room = scene.floors.flatMap((f) => f.rooms).find((r) => r.kind === 'living') ?? scene.floors[0]!.rooms[0]!;
    const countIn = (s: typeof scene) =>
      s.floors.find((f) => f.rooms.some((rr) => rr.id === room.id))!.objects.filter((o) => o.roomId === room.id).length;
    const r1 = commit(scene, designRoomPatch(scene, room)!);
    if (!r1.ok) throw new Error('design 1 failed');
    const n1 = countIn(r1.scene);
    const patch2 = designRoomPatch(r1.scene, room)!;
    expect(patch2.ops.some((o) => o.type === 'remove_object')).toBe(true); // it clears first
    const r2 = commit(r1.scene, patch2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(countIn(r2.scene)).toBe(n1); // replaced, not doubled
  });

  it('keeps a LOCKED furniture piece when auto-designing', () => {
    const seed = buildSampleHome();
    const room = seed.floors.flatMap((f) => f.rooms).find((r) => r.kind === 'living') ?? seed.floors[0]!.rooms[0]!;
    const r1 = commit(seed, designRoomPatch(seed, room)!);
    if (!r1.ok) throw new Error('seed design failed');
    const piece = r1.scene.floors.find((f) => f.rooms.some((rr) => rr.id === room.id))!.objects.find((o) => o.roomId === room.id)!;
    const locked = { ...r1.scene, locks: [{ id: 'lk', entityIds: [piece.id], createdAt: '2026-06-12T00:00:00.000Z' }] };
    const patch2 = designRoomPatch(locked, room)!;
    expect(patch2.ops.some((o) => o.type === 'remove_object' && o.objectId === piece.id)).toBe(false); // not deleted
    const r2 = commit(locked, patch2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.scene.floors.flatMap((f) => f.objects).some((o) => o.id === piece.id)).toBe(true); // survives
  });
});
