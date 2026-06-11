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
    // kitchen is wet: it gets the porcelain floor (here via the pack's kitchen
    // roomOverride, which now actually applies); living keeps the marble.
    expect(findMaterial(result.scene, kitchen.floorSurface.materialId)!.name).toBe('Grey Porcelain');
    expect(findMaterial(result.scene, living.floorSurface.materialId)!.name).toBe('Ivory Marble');
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

  it('adds and removes a reference image (chat-attached photo persistence)', () => {
    const s = scene();
    const room = s.floors[0]!.rooms[0]!;
    const image = {
      id: 'ref-1',
      kind: 'palette' as const,
      roomId: room.id,
      filePath: 'raw/chat-ref-1.png',
      extractedPalette: ['#aabbcc', '#112233'],
    };
    const added = commit(s, makePatch('add ref', [{ type: 'add_reference_image', image }]));
    if (!added.ok) throw new Error(JSON.stringify(added.errors));
    expect(added.scene.referenceImages.map((r) => r.id)).toContain('ref-1');
    expect(hasErrors(validateScene(added.scene))).toBe(false);

    const removed = commit(added.scene, makePatch('rm ref', [{ type: 'remove_reference_image', imageId: 'ref-1' }]));
    if (!removed.ok) throw new Error(JSON.stringify(removed.errors));
    expect(removed.scene.referenceImages.some((r) => r.id === 'ref-1')).toBe(false);
  });
});

describe('update_stair', () => {
  const stairOf = (s: HomeScene) => s.floors.flatMap((f) => f.stairs).find((st) => st.id === 'stair-main')!;

  it('moves a stair (position)', () => {
    const { scene: next } = mustCommit(
      scene(),
      makePatch('move stair', [{ type: 'update_stair', stairId: 'stair-main', patch: { position: { x: 1200, y: 800 } } }]),
    );
    expect(stairOf(next).position).toEqual({ x: 1200, y: 800 });
    expect(hasErrors(validateScene(next))).toBe(false);
  });

  it('rotates a stair and keeps other fields', () => {
    const before = stairOf(scene());
    const { scene: next } = mustCommit(
      scene(),
      makePatch('rotate stair', [{ type: 'update_stair', stairId: 'stair-main', patch: { rotation: Math.PI } }]),
    );
    const after = stairOf(next);
    expect(after.rotation).toBe(Math.PI);
    expect(after.position).toEqual(before.position); // untouched fields preserved
    expect(after.width).toBe(before.width);
  });

  it('changes turn direction and kind and step material', () => {
    const { scene: next } = mustCommit(
      scene(),
      makePatch('reshape stair', [
        { type: 'update_stair', stairId: 'stair-main', patch: { turn: 'left', kind: 'straight', materialId: 'mat-floor-walnut' } },
      ]),
    );
    const after = stairOf(next);
    expect(after.turn).toBe('left');
    expect(after.kind).toBe('straight');
    expect(after.materialId).toBe('mat-floor-walnut');
    expect(hasErrors(validateScene(next))).toBe(false);
  });

  it('rejects an unknown stair id', () => {
    const res = commit(scene(), makePatch('bad', [{ type: 'update_stair', stairId: 'nope', patch: { rotation: 1 } }]));
    expect(res.ok).toBe(false);
  });

  it('undo restores the prior position', () => {
    const s0 = scene();
    const before = stairOf(s0).position;
    const { scene: moved, entry } = mustCommit(
      s0,
      makePatch('move', [{ type: 'update_stair', stairId: 'stair-main', patch: { position: { x: 9999, y: 9999 } } }]),
    );
    expect(stairOf(moved).position).toEqual({ x: 9999, y: 9999 });
    const undone = commitPatches(moved, entry.undo);
    if (!undone.ok) throw new Error(JSON.stringify(undone.errors));
    expect(stairOf(undone.scene).position).toEqual(before);
  });
});

describe('rename_entity (rooms)', () => {
  const roomName = (s: HomeScene, id: string) => s.floors.flatMap((f) => f.rooms).find((r) => r.id === id)!.name;

  it('renames a room and survives validation + undo', () => {
    const s0 = scene();
    const before = roomName(s0, 'room-living');
    const { scene: next, entry } = mustCommit(
      s0,
      makePatch('rename', [{ type: 'rename_entity', entityId: 'room-living', name: 'Great Room' }]),
    );
    expect(roomName(next, 'room-living')).toBe('Great Room');
    expect(hasErrors(validateScene(next))).toBe(false);
    const undone = commitPatches(next, entry.undo);
    if (!undone.ok) throw new Error(JSON.stringify(undone.errors));
    expect(roomName(undone.scene, 'room-living')).toBe(before);
  });

  it('rejects an unknown entity id', () => {
    expect(commit(scene(), makePatch('bad', [{ type: 'rename_entity', entityId: 'nope', name: 'X' }])).ok).toBe(false);
  });
});
