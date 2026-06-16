import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import type { HomeScene } from './schemas';
import { reconcileSummary } from './reconcile-summary';

const clone = (s: HomeScene): HomeScene => JSON.parse(JSON.stringify(s)) as HomeScene;

describe('reconcileSummary', () => {
  it('reports no changes when the scenes are identical (all kept, no patch)', () => {
    const s = buildSampleHome();
    const sum = reconcileSummary(s, clone(s));
    expect(sum.hasChanges).toBe(false);
    expect(sum.rooms.kept).toBeGreaterThan(0);
    expect(sum.rooms.remapped).toBe(0);
    expect(sum.patchOpCount).toBe(0);
    expect(sum.orphanedFurnitureIds).toEqual([]);
  });

  it('summarizes a re-extraction: fresh ids → remapped, a dropped room → deleted + orphaned furniture', () => {
    const old = buildSampleHome();
    // Simulate a fresh extraction: identical geometry but brand-new ids…
    const fresh = clone(old);
    for (const f of fresh.floors) {
      for (const r of f.rooms) r.id = `new-${r.id}`;
      for (const w of f.walls) w.id = `new-${w.id}`;
    }
    // …and the new extraction is missing the first floor-0 room.
    const droppedOldId = old.floors[0]!.rooms[0]!.id;
    fresh.floors[0]!.rooms = fresh.floors[0]!.rooms.filter((r) => r.id !== `new-${droppedOldId}`);

    const sum = reconcileSummary(old, fresh);
    expect(sum.hasChanges).toBe(true);
    expect(sum.rooms.remapped).toBeGreaterThan(0); // same geometry, fresh id
    expect(sum.rooms.deleted).toBeGreaterThanOrEqual(1); // the dropped room
    expect(sum.patchOpCount).toBeGreaterThan(0); // geometry updates + delete

    // furniture in the dropped room is flagged as orphaned
    const objsInDropped = old.floors[0]!.objects.filter((o) => o.roomId === droppedOldId);
    expect(sum.orphanedFurnitureIds.length).toBe(objsInDropped.length);
    for (const o of objsInDropped) expect(sum.orphanedFurnitureIds).toContain(o.id);
  });

  it('flags genuinely new rooms as added (surfaced, not auto-applied)', () => {
    const old = buildSampleHome();
    const fresh = clone(old);
    // a new room far away from everything (no geometric overlap → 'added')
    const f0 = fresh.floors[0]!;
    const sample = f0.rooms[0]!;
    f0.rooms.push({
      ...JSON.parse(JSON.stringify(sample)),
      id: 'brand-new-room',
      name: 'New Study',
      boundary: { outer: [
        { x: 99000, y: 99000 }, { x: 102000, y: 99000 }, { x: 102000, y: 102000 }, { x: 99000, y: 102000 },
      ], holes: [] },
    });
    const sum = reconcileSummary(old, fresh);
    expect(sum.rooms.added).toBeGreaterThanOrEqual(1);
    expect(sum.application.added.some((e) => e.newId === 'brand-new-room')).toBe(true);
  });
});
