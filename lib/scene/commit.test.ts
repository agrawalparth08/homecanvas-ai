import { applyPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { buildStylePackApplication } from '../styles/apply';
import { getStylePack } from '../styles/style-packs';
import { changedEntities, commit, commitPatches, type CommitLogEntry } from './commit';
import { makePatch } from './patching';
import type { HomeScene } from './schemas';
import { findMaterial, findRoom, findWall } from './selectors';
import { validateScene, hasErrors } from './validation';

const scene = () => buildSampleHome();

const lockPatch = (entityIds: string[]) =>
  makePatch('lock', [
    { type: 'set_lock', lock: { id: `lock-${entityIds.join('-')}`, entityIds, createdAt: '2026-06-10' } },
  ]);

function mustCommit(s: HomeScene, patch: ReturnType<typeof makePatch>): { scene: HomeScene; entry: CommitLogEntry } {
  const result = commit(s, patch);
  if (!result.ok) throw new Error(`commit failed: ${JSON.stringify(result.errors)}`);
  return { scene: result.scene, entry: result.entry };
}

describe('sample home base state', () => {
  it('validates with zero errors', () => {
    const issues = validateScene(scene());
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('commit pipeline', () => {
  it('assigns a material to a room floor', () => {
    const s = scene();
    const { scene: next } = mustCommit(
      s,
      makePatch('floor swap', [
        { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: 'room-living' }, materialId: 'mat-floor-walnut' },
      ]),
    );
    expect(findRoom(next, 'room-living')!.room.floorSurface.materialId).toBe('mat-floor-walnut');
    // base scene untouched (immutability)
    expect(findRoom(s, 'room-living')!.room.floorSurface.materialId).toBe('mat-floor-oak');
  });

  it('rejects assignment of a missing material', () => {
    const result = commit(
      scene(),
      makePatch('bad', [
        { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: 'room-living' }, materialId: 'mat-nope' },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it('set_surface_color normalizes into a derived material', () => {
    const { scene: next } = mustCommit(
      scene(),
      makePatch('paint it green', [
        { type: 'set_surface_color', surface: { kind: 'wallSide', wallId: 'w-int-spine', side: 'sideA' }, color: '#3a5f4b' },
      ]),
    );
    const wall = findWall(next, 'w-int-spine')!.wall;
    const material = findMaterial(next, wall.materialIds.sideA)!;
    expect(material.baseColor).toBe('#3a5f4b');
    expect(material.category).toBe('paint');
    expect(material.sourceReference).toBe('derived:color');
  });

  it('reuses the derived material for the same color', () => {
    const s1 = mustCommit(
      scene(),
      makePatch('a', [
        { type: 'set_surface_color', surface: { kind: 'roomFloor', roomId: 'room-bath' }, color: '#3a5f4b' },
      ]),
    ).scene;
    const count1 = s1.materials.length;
    const s2 = mustCommit(
      s1,
      makePatch('b', [
        { type: 'set_surface_color', surface: { kind: 'roomFloor', roomId: 'room-kitchen' }, color: '#3a5f4b' },
      ]),
    ).scene;
    expect(s2.materials.length).toBe(count1);
  });

  it('places and removes furniture, maintaining room membership', () => {
    const s = scene();
    const object = {
      id: 'f-test-chair',
      roomId: 'room-dining',
      category: 'chair' as const,
      name: 'Test Chair',
      procedural: { kind: 'chair' },
      transform: { x: 5000, y: 1500, elevation: 0, rotationY: 0 },
      dimensions: { w: 500, d: 500, h: 900 },
      footprint: [
        { x: -250, y: -250 },
        { x: 250, y: -250 },
        { x: 250, y: 250 },
        { x: -250, y: 250 },
      ],
      materialIds: ['mat-wood-teak'],
      source: { kind: 'manual' as const, confidence: 1 },
    };
    const placed = mustCommit(s, makePatch('place', [{ type: 'place_furniture', object }])).scene;
    expect(findRoom(placed, 'room-dining')!.room.furnitureIds).toContain('f-test-chair');

    const removed = mustCommit(placed, makePatch('remove', [{ type: 'remove_object', objectId: 'f-test-chair' }])).scene;
    expect(findRoom(removed, 'room-dining')!.room.furnitureIds).not.toContain('f-test-chair');
    expect(removed.floors[0]!.objects.some((o) => o.id === 'f-test-chair')).toBe(false);
  });

  it('rejects openings that overlap after an update', () => {
    // o-bath-door at u=0.25 (center 900mm) and o-stairhall-door at u=0.75 on w-int-bed2 (3600mm).
    const result = commit(
      scene(),
      makePatch('collide', [{ type: 'update_opening', openingId: 'o-stairhall-door', patch: { u: 0.27 } }]),
    );
    expect(result.ok).toBe(false);
  });

  it('recalibrates a floor atomically', () => {
    const s = scene();
    const { scene: next } = mustCommit(
      s,
      makePatch('recalibrate', [
        { type: 'recalibrate_floor', floorId: 'floor-ground', factor: 2, keepFurnitureSize: true },
      ]),
    );
    const wall = findWall(next, 'w-ext-s')!.wall;
    expect(wall.path.pts[1]!.x).toBe(21600);
    const sofa = next.floors[0]!.objects.find((o) => o.id === 'f-sofa')!;
    expect(sofa.transform.x).toBe(4400);
    expect(sofa.dimensions.w).toBe(2300); // kept real-world size
    // terrace floor untouched
    const parapet = findWall(next, 'p-s')!.wall;
    expect(parapet.path.pts[1]!.x).toBe(10800);
  });

  it('reports a precise effect set', () => {
    const s = scene();
    const result = commit(
      s,
      makePatch('one wall', [
        { type: 'assign_material_to_surface', surface: { kind: 'wallSide', wallId: 'w-ext-s', side: 'sideA' }, materialId: 'mat-paint-beige' },
      ]),
    );
    if (!result.ok) throw new Error('commit failed');
    expect(result.changedEntityIds).toEqual(['w-ext-s']);
  });
});

describe('undo/redo through the pipeline', () => {
  it('undo restores the exact prior scene', () => {
    const s = scene();
    const { scene: next, entry } = mustCommit(
      s,
      makePatch('swap', [
        { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: 'room-living' }, materialId: 'mat-floor-walnut' },
      ]),
    );
    const undone = commitPatches(next, entry.undo);
    if (!undone.ok) throw new Error('undo failed');
    expect(undone.scene).toEqual(s);
  });

  it('redo after undo restores the edited scene', () => {
    const s = scene();
    const { scene: next, entry } = mustCommit(
      s,
      makePatch('swap', [
        { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: 'room-living' }, materialId: 'mat-floor-walnut' },
      ]),
    );
    const undone = commitPatches(next, entry.undo);
    if (!undone.ok) throw new Error('undo failed');
    const redone = commitPatches(undone.scene, entry.redo);
    if (!redone.ok) throw new Error('redo failed');
    expect(findRoom(redone.scene, 'room-living')!.room.floorSurface.materialId).toBe('mat-floor-walnut');
  });

  it('raw immer applyPatches would bypass locks — commitPatches must not', () => {
    const s = scene();
    const { scene: edited, entry } = mustCommit(
      s,
      makePatch('swap', [
        { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: 'room-living' }, materialId: 'mat-floor-walnut' },
      ]),
    );
    const locked = mustCommit(edited, lockPatch(['room-living'])).scene;

    // Sanity: raw immer happily reverts the locked room (this is the hole).
    const raw = applyPatches(locked, entry.undo);
    expect((raw as HomeScene).floors[0]!.rooms[0]!.floorSurface.materialId).toBe('mat-floor-oak');

    // The pipeline closes it.
    const gated = commitPatches(locked, entry.undo);
    expect(gated.ok).toBe(false);
  });
});

describe('lock enforcement (effect set)', () => {
  it('rejects direct edits to a locked entity', () => {
    const locked = mustCommit(scene(), lockPatch(['room-kitchen'])).scene;
    const result = commit(
      locked,
      makePatch('try', [
        { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: 'room-kitchen' }, materialId: 'mat-floor-oak' },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message).toContain('locked');
  });

  it('catches indirect effects: removing a wall mutates rooms referencing it', () => {
    const locked = mustCommit(scene(), lockPatch(['room-living'])).scene;
    // Removing the spine wall would edit room-living.wallIds — locked.
    const result = commit(locked, makePatch('remove wall', [{ type: 'remove_wall', wallId: 'w-int-spine' }]));
    expect(result.ok).toBe(false);
  });

  it('update_material copy-on-writes around locked referencers', () => {
    const s = scene();
    // Lock the master bedroom; its floor uses mat-floor-oak, as does the living room.
    const locked = mustCommit(s, lockPatch(['room-master'])).scene;
    const result = commit(
      locked,
      makePatch('darken oak', [
        { type: 'update_material', materialId: 'mat-floor-oak', patch: { baseColor: '#7a5c3a' } },
      ]),
    );
    if (!result.ok) throw new Error(`expected CoW commit to pass: ${JSON.stringify(result.errors)}`);
    const next = result.scene;
    // locked room keeps the original material, byte-identical
    expect(findRoom(next, 'room-master')!.room.floorSurface.materialId).toBe('mat-floor-oak');
    expect(findMaterial(next, 'mat-floor-oak')!.baseColor).toBe('#b08a5e');
    // unlocked rooms got re-pointed to the updated clone
    const livingMat = findRoom(next, 'room-living')!.room.floorSurface.materialId;
    expect(livingMat).not.toBe('mat-floor-oak');
    expect(findMaterial(next, livingMat)!.baseColor).toBe('#7a5c3a');
  });

  it('lock ops themselves are exempt from the gate', () => {
    const locked = mustCommit(scene(), lockPatch(['room-kitchen'])).scene;
    const unlocked = commit(locked, makePatch('unlock', [{ type: 'remove_lock', lockId: 'lock-room-kitchen' }]));
    expect(unlocked.ok).toBe(true);
  });
});

describe('style pack application', () => {
  it('applies a pack to one room through the pipeline', () => {
    const s = scene();
    const app = buildStylePackApplication(s, getStylePack('fusion-japandi'), { roomIds: ['room-living'] });
    expect(app.patch).not.toBeNull();
    const result = commit(s, app.patch!);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const room = findRoom(result.scene, 'room-living')!.room;
    expect(room.styleTags).toEqual(['fusion-japandi']);
    expect(findMaterial(result.scene, room.floorSurface.materialId)!.name).toBe('Warm Oak');
  });

  it('whole-home application uses wet floors in wet rooms', () => {
    const s = scene();
    const app = buildStylePackApplication(s, getStylePack('indian-modern'), 'wholeHome');
    const result = commit(s, app.patch!);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const kitchen = findRoom(result.scene, 'room-kitchen')!.room;
    const living = findRoom(result.scene, 'room-living')!.room;
    expect(kitchen.floorSurface.materialId).toBe('mat-pack-indian-modern-wetfloor');
    expect(living.floorSurface.materialId).toBe('mat-pack-indian-modern-floor');
  });

  it('onLocked=skip pre-filters locked rooms and reports them', () => {
    const locked = mustCommit(scene(), lockPatch(['room-kitchen'])).scene;
    const app = buildStylePackApplication(locked, getStylePack('warm-minimal'), 'wholeHome', 'skip');
    expect(app.skipped).toContain('room-kitchen');
    const result = commit(locked, app.patch!);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(findRoom(result.scene, 'room-kitchen')!.room.floorSurface.materialId).toBe('mat-tile-grey');
    }
  });

  it('onLocked=fail lets the gate reject the whole commit', () => {
    const locked = mustCommit(scene(), lockPatch(['room-kitchen'])).scene;
    const app = buildStylePackApplication(locked, getStylePack('warm-minimal'), 'wholeHome', 'fail');
    const result = commit(locked, app.patch!);
    expect(result.ok).toBe(false);
  });
});

describe('changedEntities', () => {
  it('returns empty for identical scenes', () => {
    const s = scene();
    expect(changedEntities(s, s)).toEqual([]);
  });

  it('scene-level validation still passes after a style pack sweep', () => {
    const s = scene();
    const app = buildStylePackApplication(s, getStylePack('contemporary-luxury'), 'wholeHome');
    const result = commit(s, app.patch!);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(hasErrors(validateScene(result.scene))).toBe(false);
  });
});
