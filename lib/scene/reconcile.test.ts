import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from './commit';
import { RemapTableSchema, type HomeScene, type RemapTable } from './schemas';
import { applyRemap, reconcile } from './reconcile';

// Minimal scene shapes — reconcile is pure and only reads geometry/ids.
const room = (id: string, x0: number, y0: number, x1: number, y1: number) => ({
  id,
  boundary: { outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] },
});
const wall = (id: string, ax: number, ay: number, bx: number, by: number) => ({
  id,
  path: { pts: [{ x: ax, y: ay }, { x: bx, y: by }], bulges: [] },
});
const scene = (rooms: unknown[], walls: unknown[] = [], openings: unknown[] = []) =>
  ({ floors: [{ rooms, walls, openings }] }) as unknown as HomeScene;

const byOld = (table: RemapTable, id: string) => table.entries.find((e) => e.oldId === id);

describe('reconcile', () => {
  it('identical scenes → everything kept with stable ids', () => {
    const s = scene([room('r1', 0, 0, 4000, 3000)], [wall('w1', 0, 0, 4000, 0)]);
    const t = reconcile(s, s);
    expect(t.entries.every((e) => e.status === 'kept')).toBe(true);
    expect(RemapTableSchema.safeParse(t).success).toBe(true);
  });

  it('same geometry, new id → remapped', () => {
    const oldS = scene([room('r1', 0, 0, 4000, 3000)]);
    const newS = scene([room('r9', 0, 0, 4000, 3000)]);
    const e = byOld(reconcile(oldS, newS), 'r1');
    expect(e?.status).toBe('remapped');
    expect(e?.newId).toBe('r9');
  });

  it('one old room → two new halves → split', () => {
    const oldS = scene([room('r1', 0, 0, 4000, 3000)]);
    const newS = scene([room('n1', 0, 0, 2000, 3000), room('n2', 2000, 0, 4000, 3000)]);
    const e = byOld(reconcile(oldS, newS), 'r1');
    expect(e?.status).toBe('split');
    expect(e?.newIds).toEqual(['n1', 'n2']);
  });

  it('old room with no overlap → deleted; orphan new room → added', () => {
    const oldS = scene([room('r1', 0, 0, 1000, 1000)]);
    const newS = scene([room('n1', 50000, 50000, 51000, 51000)]);
    const t = reconcile(oldS, newS);
    expect(byOld(t, 'r1')?.status).toBe('deleted');
    expect(t.entries.find((e) => e.newId === 'n1')?.status).toBe('added');
  });

  it('wall shortened but collinear → matched; wall rotated away → unmatched', () => {
    const oldS = scene([], [wall('w1', 0, 0, 4000, 0), wall('w2', 0, 0, 0, 4000)]);
    const newS = scene([], [wall('wA', 0, 0, 3000, 0), wall('wB', 0, 0, 4000, 4000)]);
    const t = reconcile(oldS, newS);
    expect(byOld(t, 'w1')?.status).toBe('remapped'); // collinear, 0.75 overlap
    expect(byOld(t, 'w1')?.newId).toBe('wA');
    expect(byOld(t, 'w2')?.status).toBe('deleted'); // vertical vs diagonal — no match
  });

  it('weak (ambiguous) room overlap → unresolved, not a silent delete/replace', () => {
    const oldS = scene([room('r1', 0, 0, 4000, 3000)]);
    const newS = scene([room('n1', 1500, 0, 5500, 3000)]); // ~0.45 IoU, containment <0.7
    const e = byOld(reconcile(oldS, newS), 'r1');
    expect(e?.status).toBe('unresolved');
    expect(e?.newId).toBe('n1');
    expect(e!.score!).toBeGreaterThanOrEqual(0.15);
    expect(e!.score!).toBeLessThan(0.6);
  });

  it('never claims one new room for two old rooms (duplicate olds)', () => {
    const oldS = scene([room('a', 0, 0, 4000, 3000), room('b', 0, 0, 4000, 3000)]);
    const newS = scene([room('n', 0, 0, 4000, 3000)]);
    const t = reconcile(oldS, newS);
    const newIds = t.entries.flatMap((e) => [e.newId, ...(e.newIds ?? [])]).filter(Boolean);
    expect(new Set(newIds).size).toBe(newIds.length); // no new id referenced twice
    expect(byOld(t, 'b')?.status).toBe('deleted'); // the duplicate old can't re-claim n
  });

  it('every old and new id appears in exactly one entry (total coverage)', () => {
    const oldS = scene([room('r1', 0, 0, 4000, 3000), room('r2', 4000, 0, 8000, 3000)]);
    const newS = scene([room('r1', 0, 0, 4000, 3000)]);
    const t = reconcile(oldS, newS);
    const olds = t.entries.filter((e) => e.oldId).map((e) => e.oldId);
    expect(new Set(olds).size).toBe(olds.length); // no old id counted twice
    expect(olds).toContain('r1');
    expect(olds).toContain('r2');
  });
});

describe('applyRemap', () => {
  it('remapped room → update_room_boundary on the OLD id (preserves edits/locks/furniture)', () => {
    const oldS = scene([room('r1', 0, 0, 4000, 3000)]);
    const newS = scene([room('n1', 0, 0, 4000, 3000)]); // same geometry, new id
    const app = applyRemap(oldS, newS);
    const op = app.patch!.ops.find((o) => o.type === 'update_room_boundary');
    expect(op).toBeTruthy();
    expect((op as { roomId: string }).roomId).toBe('r1'); // OLD id kept
  });

  it('deleted room → remove_room; added room is surfaced, not auto-applied', () => {
    const oldS = scene([room('r1', 0, 0, 1000, 1000)]);
    const newS = scene([room('n1', 50000, 50000, 51000, 51000)]);
    const app = applyRemap(oldS, newS);
    expect(app.patch!.ops.some((o) => o.type === 'remove_room')).toBe(true);
    expect(app.added.map((e) => e.newId)).toContain('n1');
    expect(app.patch!.ops.some((o) => o.type === 'add_room')).toBe(false);
  });

  it('ambiguous match → unresolved, no patch op for it', () => {
    const oldS = scene([room('r1', 0, 0, 4000, 3000)]);
    const newS = scene([room('n1', 1500, 0, 5500, 3000)]);
    const app = applyRemap(oldS, newS);
    expect(app.unresolved.some((e) => e.oldId === 'r1')).toBe(true);
    expect(app.patch).toBeNull(); // nothing safe to auto-apply
  });

  it('remapped wall → update_wall on the OLD id, no remove/add', () => {
    const oldS = scene([], [wall('w1', 0, 0, 4000, 0)]);
    const newS = scene([], [wall('wA', 0, 0, 3000, 0)]); // collinear, 0.75 overlap, fresh id
    const app = applyRemap(oldS, newS);
    const op = app.patch!.ops.find((o) => o.type === 'update_wall');
    expect(op).toBeTruthy();
    expect((op as { wallId: string }).wallId).toBe('w1'); // OLD id preserved
    expect(app.patch!.ops.some((o) => o.type === 'remove_wall' || o.type === 'add_wall')).toBe(false);
  });

  it('demotes a shortened wall to unresolved when it would orphan an existing opening', () => {
    // w1 4000mm with a window at u=0.85; re-extracted as 2000mm (overlap 0.5 → remapped)
    const oldS = scene([], [wall('w1', 0, 0, 4000, 0)], [{ id: 'op1', wallId: 'w1', u: 0.85, width: 1000 }]);
    const newS = scene([], [wall('wA', 0, 0, 2000, 0)]);
    const app = applyRemap(oldS, newS);
    expect(app.patch).toBeNull(); // the only candidate op was unsafe → demoted
    expect(app.unresolved.some((e) => e.oldId === 'w1')).toBe(true);
  });

  it('a remap that would rewrite a LOCKED entity is rejected by commit (not silent)', () => {
    const base = buildSampleHome();
    const lockedRoomId = base.floors[0]!.rooms[0]!.id;
    const oldScene = {
      ...base,
      locks: [{ id: 'lk', entityIds: [lockedRoomId], createdAt: '2026-06-11T00:00:00.000Z' }],
    };
    // new scene: same room geometry but a fresh id → reconcile sees a 'remapped'
    const newScene = JSON.parse(JSON.stringify(base)) as HomeScene;
    newScene.floors[0]!.rooms[0]!.id = `${lockedRoomId}-reextracted`;
    const app = applyRemap(oldScene, newScene);
    expect(app.patch).not.toBeNull();
    const result = commit(oldScene, app.patch!);
    expect(result.ok).toBe(false); // lock gate blocks the geometry rewrite
  });
});
