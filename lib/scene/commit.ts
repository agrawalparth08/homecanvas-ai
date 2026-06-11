import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { snapMm } from '../geometry/constants';
import { ScenePatchSchema, type PatchOp, type ScenePatch, type SurfaceRef } from './patching';
import { SCHEMA_VERSION, type Floor, type HomeScene, type Material } from './schemas';
import { lockedEntityIds } from './selectors';
import { hasErrors, validateScene, type ValidationIssue } from './validation';

enablePatches();

/**
 * THE single write path for the scene graph.
 *
 *   commit(scene, patch):
 *     1. zod-parse the patch (agents and UI both go through here)
 *     2. apply ops on an immer draft  -> newScene + [patches, inversePatches]
 *     3. effect-set lock check: any entity whose object identity changed
 *        (structural sharing makes this exact) must not be locked
 *     4. full validation (schema + referential integrity + geometry sanity)
 *     5. emit a version-stamped log entry for the per-variant patch log
 *
 * Undo/redo replays immer patches through commitPatches() — the SAME
 * validation/lock gate — never a raw snapshot swap.
 */

export interface CommitLogEntry {
  schemaVersion: number;
  patch: ScenePatch;
  redo: Patch[];
  undo: Patch[];
  committedAt: string;
}

export type CommitResult =
  | { ok: true; scene: HomeScene; entry: CommitLogEntry; changedEntityIds: string[] }
  | { ok: false; errors: ValidationIssue[] };

export class OpError extends Error {
  constructor(
    message: string,
    public readonly entityId?: string,
  ) {
    super(message);
  }
}

export function commit(scene: HomeScene, rawPatch: ScenePatch): CommitResult {
  const parsed = ScenePatchSchema.safeParse(rawPatch);
  if (!parsed.success) {
    return { ok: false, errors: [{ severity: 'error', message: `invalid patch: ${parsed.error.message}` }] };
  }
  const patch = parsed.data;

  let produced: readonly [HomeScene, Patch[], Patch[]];
  try {
    produced = produceWithPatches(scene, (draft) => {
      for (const op of patch.ops) applyOp(draft, op);
      draft.meta.updatedAt = new Date().toISOString();
    });
  } catch (err) {
    if (err instanceof OpError) {
      const issue: ValidationIssue = { severity: 'error', message: err.message };
      if (err.entityId !== undefined) issue.entityId = err.entityId;
      return { ok: false, errors: [issue] };
    }
    throw err;
  }
  const [next, redo, undo] = produced;

  const gate = gateCommit(scene, next, patch.ops);
  if (gate) return gate;

  return {
    ok: true,
    scene: next,
    entry: {
      schemaVersion: SCHEMA_VERSION,
      patch,
      redo,
      undo,
      committedAt: new Date().toISOString(),
    },
    changedEntityIds: changedEntities(scene, next),
  };
}

/** Replay previously-recorded immer patches (undo/redo) through the same gate. */
export function commitPatches(scene: HomeScene, patches: Patch[]): CommitResult {
  const next = applyPatches(scene, patches) as HomeScene;
  const gate = gateCommit(scene, next, []);
  if (gate) return gate;
  return {
    ok: true,
    scene: next,
    entry: {
      schemaVersion: SCHEMA_VERSION,
      patch: { id: 'replay', ops: [], origin: 'system', description: 'history replay' } as unknown as ScenePatch,
      redo: patches,
      undo: [],
      committedAt: new Date().toISOString(),
    },
    changedEntityIds: changedEntities(scene, next),
  };
}

function gateCommit(base: HomeScene, next: HomeScene, ops: PatchOp[]): CommitResult | null {
  // Lock ops themselves manage the lock list; everything else faces the gate.
  const lockOpsOnly = ops.length > 0 && ops.every((o) => o.type === 'set_lock' || o.type === 'remove_lock');
  if (!lockOpsOnly) {
    const locked = lockedEntityIds(base);
    if (locked.size > 0) {
      const violations = changedEntities(base, next).filter((id) => locked.has(id));
      if (violations.length > 0) {
        return {
          ok: false,
          errors: violations.map((id) => ({
            severity: 'error' as const,
            entityId: id,
            message: `entity "${id}" is locked and would be modified by this commit`,
          })),
        };
      }
    }
  }

  const issues = validateScene(next);
  if (hasErrors(issues)) return { ok: false, errors: issues.filter((i) => i.severity === 'error') };
  return null;
}

/**
 * Effect set via structural sharing: immer keeps object identity for untouched
 * subtrees, so identity-diffing the entity registries is an exact, parser-free
 * answer to "which entities did this commit actually change".
 */
type Registry = Map<string, unknown>;

function registry(scene: HomeScene): Registry {
  const reg: Registry = new Map();
  for (const floor of scene.floors) {
    for (const e of floor.rooms) reg.set(e.id, e);
    for (const e of floor.walls) reg.set(e.id, e);
    for (const e of floor.openings) reg.set(e.id, e);
    for (const e of floor.objects) reg.set(e.id, e);
    for (const e of floor.stairs) reg.set(e.id, e);
    for (const e of floor.lights) reg.set(e.id, e);
  }
  for (const m of scene.materials) reg.set(m.id, m);
  return reg;
}

export function changedEntities(base: HomeScene, next: HomeScene): string[] {
  if (base === next) return [];
  const a = registry(base);
  const b = registry(next);
  const changed = new Set<string>();
  for (const [id, entity] of a) {
    const other = b.get(id);
    if (other === undefined) changed.add(id); // removed
    else if (other !== entity) changed.add(id); // mutated (new identity)
  }
  for (const id of b.keys()) {
    if (!a.has(id)) changed.add(id); // added
  }
  return [...changed];
}

// ---------------------------------------------------------------------------
// op application (immer draft mutations)
// ---------------------------------------------------------------------------

function floorOf(draft: HomeScene, floorId: string): Floor {
  const floor = draft.floors.find((f) => f.id === floorId);
  if (!floor) throw new OpError(`floor "${floorId}" not found`, floorId);
  return floor;
}

function findIn<T extends { id: string }>(list: T[], id: string, what: string): T {
  const item = list.find((e) => e.id === id);
  if (!item) throw new OpError(`${what} "${id}" not found`, id);
  return item;
}

function eachFloor<T>(draft: HomeScene, fn: (floor: Floor) => T | undefined): T | undefined {
  for (const floor of draft.floors) {
    const r = fn(floor);
    if (r !== undefined) return r;
  }
  return undefined;
}

function assignSurfaceMaterial(draft: HomeScene, surface: SurfaceRef, materialId: string): void {
  if (!draft.materials.some((m) => m.id === materialId)) {
    throw new OpError(`material "${materialId}" not found`, materialId);
  }
  if (surface.kind === 'wallSide') {
    const wall = eachFloor(draft, (f) => f.walls.find((w) => w.id === surface.wallId));
    if (!wall) throw new OpError(`wall "${surface.wallId}" not found`, surface.wallId);
    wall.materialIds[surface.side] = materialId;
    return;
  }
  const room = eachFloor(draft, (f) => f.rooms.find((r) => r.id === surface.roomId));
  if (!room) throw new OpError(`room "${surface.roomId}" not found`, surface.roomId);
  if (surface.kind === 'roomFloor') {
    room.floorSurface.materialId = materialId;
  } else {
    if (!room.ceilingSurface) throw new OpError(`room "${room.id}" has no ceiling surface`, room.id);
    room.ceilingSurface.materialId = materialId;
  }
}

function applyOp(draft: HomeScene, op: PatchOp): void {
  switch (op.type) {
    case 'assign_material_to_surface': {
      assignSurfaceMaterial(draft, op.surface, op.materialId);
      return;
    }

    case 'set_surface_color': {
      // Normalize the sugar: one canonical appearance representation (materials).
      const existing = draft.materials.find(
        (m) => m.category === 'paint' && m.baseColor.toLowerCase() === op.color.toLowerCase() && m.sourceReference === 'derived:color',
      );
      let material: Material;
      if (existing) {
        material = existing;
      } else {
        material = {
          id: `mat-color-${op.color.slice(1).toLowerCase()}`,
          name: `Paint ${op.color.toUpperCase()}`,
          category: 'paint',
          baseColor: op.color.toLowerCase(),
          pbr: { roughness: 0.92, metallic: 0, repeatScale: 1000 },
          styleTags: [],
          sourceReference: 'derived:color',
        };
        if (draft.materials.some((m) => m.id === material.id)) {
          material.id = `${material.id}-${draft.materials.length}`;
        }
        draft.materials.push(material);
      }
      assignSurfaceMaterial(draft, op.surface, material.id);
      return;
    }

    case 'add_material': {
      if (draft.materials.some((m) => m.id === op.material.id)) {
        throw new OpError(`material id "${op.material.id}" already exists`, op.material.id);
      }
      draft.materials.push(op.material);
      return;
    }

    case 'update_material': {
      const material = findIn(draft.materials, op.materialId, 'material');
      // Copy-on-write against locks: if any LOCKED entity references this
      // material, the locked entity must keep its exact appearance AND bytes.
      // So: apply the update as a NEW material and re-point only the UNLOCKED
      // referencers; the original stays for the locked ones.
      const locked = lockedEntityIds(draft as unknown as HomeScene);
      const lockedReferencers: string[] = [];
      const unlockedAssign: (() => void)[] = [];
      for (const floor of draft.floors) {
        for (const wall of floor.walls) {
          for (const side of ['sideA', 'sideB'] as const) {
            if (wall.materialIds[side] === op.materialId) {
              if (locked.has(wall.id)) lockedReferencers.push(wall.id);
              else unlockedAssign.push(() => (wall.materialIds[side] = updatedId()));
            }
          }
        }
        for (const room of floor.rooms) {
          if (room.floorSurface.materialId === op.materialId) {
            if (locked.has(room.id)) lockedReferencers.push(room.id);
            else unlockedAssign.push(() => (room.floorSurface.materialId = updatedId()));
          }
          if (room.ceilingSurface?.materialId === op.materialId) {
            if (locked.has(room.id)) lockedReferencers.push(room.id);
            else unlockedAssign.push(() => (room.ceilingSurface!.materialId = updatedId()));
          }
        }
        for (const obj of floor.objects) {
          obj.materialIds.forEach((mid, i) => {
            if (mid === op.materialId) {
              if (locked.has(obj.id)) lockedReferencers.push(obj.id);
              else unlockedAssign.push(() => (obj.materialIds[i] = updatedId()));
            }
          });
        }
        for (const stair of floor.stairs) {
          if (stair.materialId === op.materialId) {
            if (locked.has(stair.id)) lockedReferencers.push(stair.id);
            else unlockedAssign.push(() => (stair.materialId = updatedId()));
          }
        }
      }

      let newMaterialId: string | null = null;
      const updatedId = () => {
        if (newMaterialId) return newMaterialId;
        newMaterialId = `${op.materialId}-v${draft.materials.length}`;
        const clone: Material = { ...JSON.parse(JSON.stringify(material)), ...op.patch, id: newMaterialId } as Material;
        draft.materials.push(clone);
        return newMaterialId;
      };

      if (lockedReferencers.length === 0) {
        Object.assign(material, op.patch);
      } else {
        unlockedAssign.forEach((assign) => assign());
      }
      return;
    }

    case 'place_furniture': {
      const room = eachFloor(draft, (f) => f.rooms.find((r) => r.id === op.object.roomId));
      if (!room) throw new OpError(`room "${op.object.roomId}" not found`, op.object.roomId);
      const floor = floorOf(draft, room.floorId);
      if (floor.objects.some((o) => o.id === op.object.id)) {
        throw new OpError(`object id "${op.object.id}" already exists`, op.object.id);
      }
      floor.objects.push({
        ...op.object,
        transform: {
          ...op.object.transform,
          x: snapMm(op.object.transform.x),
          y: snapMm(op.object.transform.y),
        },
      });
      room.furnitureIds.push(op.object.id);
      return;
    }

    case 'remove_object': {
      for (const floor of draft.floors) {
        const idx = floor.objects.findIndex((o) => o.id === op.objectId);
        if (idx >= 0) {
          const obj = floor.objects[idx]!;
          floor.objects.splice(idx, 1);
          const room = floor.rooms.find((r) => r.id === obj.roomId);
          if (room) room.furnitureIds = room.furnitureIds.filter((id) => id !== op.objectId);
          return;
        }
      }
      throw new OpError(`object "${op.objectId}" not found`, op.objectId);
    }

    case 'transform_object': {
      const obj = eachFloor(draft, (f) => f.objects.find((o) => o.id === op.objectId));
      if (!obj) throw new OpError(`object "${op.objectId}" not found`, op.objectId);
      if (op.transform.x !== undefined) obj.transform.x = snapMm(op.transform.x);
      if (op.transform.y !== undefined) obj.transform.y = snapMm(op.transform.y);
      if (op.transform.elevation !== undefined) obj.transform.elevation = op.transform.elevation;
      if (op.transform.rotationY !== undefined) obj.transform.rotationY = op.transform.rotationY;
      return;
    }

    case 'replace_object': {
      const obj = eachFloor(draft, (f) => f.objects.find((o) => o.id === op.objectId));
      if (!obj) throw new OpError(`object "${op.objectId}" not found`, op.objectId);
      if (op.object.roomId !== obj.roomId) {
        throw new OpError('replace_object cannot move objects between rooms (remove + place instead)', op.objectId);
      }
      Object.assign(obj, op.object, { id: op.objectId });
      return;
    }

    case 'add_room': {
      const floor = floorOf(draft, op.floorId);
      if (floor.rooms.some((r) => r.id === op.room.id)) {
        throw new OpError(`room id "${op.room.id}" already exists`, op.room.id);
      }
      floor.rooms.push(op.room);
      return;
    }

    case 'remove_room': {
      for (const floor of draft.floors) {
        const idx = floor.rooms.findIndex((r) => r.id === op.roomId);
        if (idx >= 0) {
          const room = floor.rooms[idx]!;
          floor.objects = floor.objects.filter((o) => o.roomId !== room.id);
          floor.lights = floor.lights.filter((l) => l.roomId !== room.id);
          floor.rooms.splice(idx, 1);
          return;
        }
      }
      throw new OpError(`room "${op.roomId}" not found`, op.roomId);
    }

    case 'update_room_boundary': {
      const room = eachFloor(draft, (f) => f.rooms.find((r) => r.id === op.roomId));
      if (!room) throw new OpError(`room "${op.roomId}" not found`, op.roomId);
      room.boundary = op.boundary;
      return;
    }

    case 'set_room_kind': {
      const room = eachFloor(draft, (f) => f.rooms.find((r) => r.id === op.roomId));
      if (!room) throw new OpError(`room "${op.roomId}" not found`, op.roomId);
      room.kind = op.kind;
      if (op.openToSky !== undefined) {
        room.openToSky = op.openToSky;
        if (op.openToSky) delete room.ceilingSurface;
      }
      return;
    }

    case 'set_room_style_tags': {
      const room = eachFloor(draft, (f) => f.rooms.find((r) => r.id === op.roomId));
      if (!room) throw new OpError(`room "${op.roomId}" not found`, op.roomId);
      room.styleTags = op.styleTags;
      return;
    }

    case 'rename_entity': {
      const named = eachFloor(draft, (f) => {
        const hit =
          f.rooms.find((e) => e.id === op.entityId) ??
          f.objects.find((e) => e.id === op.entityId) ??
          f.stairs.find((e) => e.id === op.entityId);
        return hit as { name?: string } | undefined;
      });
      const target = named ?? draft.materials.find((m) => m.id === op.entityId);
      if (!target) throw new OpError(`entity "${op.entityId}" not found or not nameable`, op.entityId);
      (target as { name: string }).name = op.name;
      return;
    }

    case 'add_wall': {
      const floor = floorOf(draft, op.floorId);
      if (floor.walls.some((w) => w.id === op.wall.id)) {
        throw new OpError(`wall id "${op.wall.id}" already exists`, op.wall.id);
      }
      floor.walls.push(op.wall);
      return;
    }

    case 'update_wall': {
      const wall = eachFloor(draft, (f) => f.walls.find((w) => w.id === op.wallId));
      if (!wall) throw new OpError(`wall "${op.wallId}" not found`, op.wallId);
      if (op.patch.path) wall.path = op.patch.path;
      if (op.patch.thickness !== undefined) wall.thickness = op.patch.thickness;
      if (op.patch.height !== undefined) wall.height = op.patch.height;
      return;
    }

    case 'remove_wall': {
      for (const floor of draft.floors) {
        const idx = floor.walls.findIndex((w) => w.id === op.wallId);
        if (idx >= 0) {
          floor.walls.splice(idx, 1);
          floor.openings = floor.openings.filter((o) => o.wallId !== op.wallId);
          for (const room of floor.rooms) {
            room.wallIds = room.wallIds.filter((id) => id !== op.wallId);
          }
          return;
        }
      }
      throw new OpError(`wall "${op.wallId}" not found`, op.wallId);
    }

    case 'add_opening': {
      const floor = floorOf(draft, op.floorId);
      if (!floor.walls.some((w) => w.id === op.opening.wallId)) {
        throw new OpError(`opening targets missing wall "${op.opening.wallId}"`, op.opening.id);
      }
      if (floor.openings.some((o) => o.id === op.opening.id)) {
        throw new OpError(`opening id "${op.opening.id}" already exists`, op.opening.id);
      }
      floor.openings.push(op.opening);
      return;
    }

    case 'update_opening': {
      const opening = eachFloor(draft, (f) => f.openings.find((o) => o.id === op.openingId));
      if (!opening) throw new OpError(`opening "${op.openingId}" not found`, op.openingId);
      Object.assign(opening, op.patch);
      return;
    }

    case 'remove_opening': {
      for (const floor of draft.floors) {
        const idx = floor.openings.findIndex((o) => o.id === op.openingId);
        if (idx >= 0) {
          floor.openings.splice(idx, 1);
          return;
        }
      }
      throw new OpError(`opening "${op.openingId}" not found`, op.openingId);
    }

    case 'add_stair': {
      const floor = floorOf(draft, op.floorId);
      if (floor.stairs.some((s) => s.id === op.stair.id)) {
        throw new OpError(`stair id "${op.stair.id}" already exists`, op.stair.id);
      }
      floor.stairs.push(op.stair);
      return;
    }

    case 'remove_stair': {
      for (const floor of draft.floors) {
        const idx = floor.stairs.findIndex((s) => s.id === op.stairId);
        if (idx >= 0) {
          floor.stairs.splice(idx, 1);
          return;
        }
      }
      throw new OpError(`stair "${op.stairId}" not found`, op.stairId);
    }

    case 'update_stair': {
      const stair = eachFloor(draft, (f) => f.stairs.find((s) => s.id === op.stairId));
      if (!stair) throw new OpError(`stair "${op.stairId}" not found`, op.stairId);
      Object.assign(stair, op.patch);
      return;
    }

    case 'add_light': {
      const floor = floorOf(draft, op.floorId);
      if (floor.lights.some((l) => l.id === op.light.id)) {
        throw new OpError(`light id "${op.light.id}" already exists`, op.light.id);
      }
      floor.lights.push(op.light);
      return;
    }

    case 'update_light': {
      const light = eachFloor(draft, (f) => f.lights.find((l) => l.id === op.lightId));
      if (!light) throw new OpError(`light "${op.lightId}" not found`, op.lightId);
      Object.assign(light, op.patch);
      return;
    }

    case 'remove_light': {
      for (const floor of draft.floors) {
        const idx = floor.lights.findIndex((l) => l.id === op.lightId);
        if (idx >= 0) {
          floor.lights.splice(idx, 1);
          for (const room of floor.rooms) {
            room.lightIds = room.lightIds.filter((id) => id !== op.lightId);
          }
          return;
        }
      }
      throw new OpError(`light "${op.lightId}" not found`, op.lightId);
    }

    case 'set_lock': {
      const idx = draft.locks.findIndex((l) => l.id === op.lock.id);
      if (idx >= 0) draft.locks[idx] = op.lock;
      else draft.locks.push(op.lock);
      return;
    }

    case 'remove_lock': {
      const idx = draft.locks.findIndex((l) => l.id === op.lockId);
      if (idx < 0) throw new OpError(`lock "${op.lockId}" not found`, op.lockId);
      draft.locks.splice(idx, 1);
      return;
    }

    case 'recalibrate_floor': {
      const floor = floorOf(draft, op.floorId);
      const f = op.factor;
      const sv = (v: { x: number; y: number }) => {
        v.x = snapMm(v.x * f);
        v.y = snapMm(v.y * f);
      };
      for (const wall of floor.walls) wall.path.pts.forEach(sv);
      for (const room of floor.rooms) {
        room.boundary.outer.forEach(sv);
        room.boundary.holes.forEach((h) => h.forEach(sv));
      }
      for (const stair of floor.stairs) sv(stair.position);
      for (const obj of floor.objects) {
        obj.transform.x = snapMm(obj.transform.x * f);
        obj.transform.y = snapMm(obj.transform.y * f);
        if (!op.keepFurnitureSize) {
          obj.dimensions.w *= f;
          obj.dimensions.d *= f;
          obj.dimensions.h *= f;
          obj.footprint.forEach(sv);
        }
      }
      for (const light of floor.lights) {
        if (light.position) {
          light.position.x = snapMm(light.position.x * f);
          light.position.y = snapMm(light.position.y * f);
        }
      }
      if (floor.calibration) floor.calibration.mmPerPx *= f;
      return;
    }

    case 'add_reference_image': {
      if (draft.referenceImages.some((r) => r.id === op.image.id)) {
        throw new OpError(`reference image id "${op.image.id}" already exists`, op.image.id);
      }
      draft.referenceImages.push(op.image);
      return;
    }

    case 'remove_reference_image': {
      const idx = draft.referenceImages.findIndex((r) => r.id === op.imageId);
      if (idx < 0) throw new OpError(`reference image "${op.imageId}" not found`, op.imageId);
      draft.referenceImages.splice(idx, 1);
      return;
    }

    case 'set_floor_underlay': {
      floorOf(draft, op.floorId).underlay = op.underlay;
      return;
    }

    case 'clear_floor_underlay': {
      delete floorOf(draft, op.floorId).underlay;
      return;
    }

    case 'set_floor_calibration': {
      floorOf(draft, op.floorId).calibration = op.calibration;
      return;
    }

    case 'set_underlay_opacity': {
      const floor = floorOf(draft, op.floorId);
      if (!floor.underlay) throw new OpError(`floor "${op.floorId}" has no underlay`, op.floorId);
      floor.underlay.opacity = op.opacity;
      return;
    }
  }
}
