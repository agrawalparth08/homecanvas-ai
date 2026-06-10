import type { EntityId, Floor, FurnitureObject, HomeScene, Light, Material, Opening, Room, Stair, Wall } from './schemas';

/** Lookup helpers over the scene graph. Pure, no caching — scenes are small. */

export type SceneEntity =
  | { type: 'room'; entity: Room; floor: Floor }
  | { type: 'wall'; entity: Wall; floor: Floor }
  | { type: 'opening'; entity: Opening; floor: Floor }
  | { type: 'furniture'; entity: FurnitureObject; floor: Floor }
  | { type: 'stair'; entity: Stair; floor: Floor }
  | { type: 'light'; entity: Light; floor: Floor }
  | { type: 'material'; entity: Material };

export function findEntity(scene: HomeScene, id: EntityId): SceneEntity | null {
  for (const floor of scene.floors) {
    for (const entity of floor.rooms) if (entity.id === id) return { type: 'room', entity, floor };
    for (const entity of floor.walls) if (entity.id === id) return { type: 'wall', entity, floor };
    for (const entity of floor.openings) if (entity.id === id) return { type: 'opening', entity, floor };
    for (const entity of floor.objects) if (entity.id === id) return { type: 'furniture', entity, floor };
    for (const entity of floor.stairs) if (entity.id === id) return { type: 'stair', entity, floor };
    for (const entity of floor.lights) if (entity.id === id) return { type: 'light', entity, floor };
  }
  for (const entity of scene.materials) if (entity.id === id) return { type: 'material', entity };
  return null;
}

export function findMaterial(scene: HomeScene, id: EntityId): Material | null {
  return scene.materials.find((m) => m.id === id) ?? null;
}

export function findWall(scene: HomeScene, id: EntityId): { wall: Wall; floor: Floor } | null {
  for (const floor of scene.floors) {
    const wall = floor.walls.find((w) => w.id === id);
    if (wall) return { wall, floor };
  }
  return null;
}

export function findRoom(scene: HomeScene, id: EntityId): { room: Room; floor: Floor } | null {
  for (const floor of scene.floors) {
    const room = floor.rooms.find((r) => r.id === id);
    if (room) return { room, floor };
  }
  return null;
}

export function wallOpenings(floor: Floor, wallId: EntityId): Opening[] {
  return floor.openings.filter((o) => o.wallId === wallId);
}

export function allEntityIds(scene: HomeScene): Set<EntityId> {
  const ids = new Set<EntityId>();
  for (const floor of scene.floors) {
    ids.add(floor.id);
    for (const r of floor.rooms) {
      ids.add(r.id);
      ids.add(r.floorSurface.id);
      if (r.ceilingSurface) ids.add(r.ceilingSurface.id);
    }
    for (const w of floor.walls) ids.add(w.id);
    for (const o of floor.openings) ids.add(o.id);
    for (const f of floor.objects) ids.add(f.id);
    for (const s of floor.stairs) ids.add(s.id);
    for (const l of floor.lights) ids.add(l.id);
  }
  for (const m of scene.materials) ids.add(m.id);
  for (const l of scene.locks) ids.add(l.id);
  for (const r of scene.referenceImages) ids.add(r.id);
  return ids;
}

/** All entity ids currently protected by lock constraints. */
export function lockedEntityIds(scene: HomeScene): Set<EntityId> {
  const ids = new Set<EntityId>();
  for (const lock of scene.locks) for (const id of lock.entityIds) ids.add(id);
  return ids;
}

/** Elevation (mm) of a floor's slab top. v1: stacked uniform floor heights. */
export function floorElevation(scene: HomeScene, floorId: EntityId): number {
  const sorted = [...scene.floors].sort((a, b) => a.level - b.level);
  let elevation = 0;
  for (const f of sorted) {
    if (f.id === floorId) return elevation;
    elevation += f.floorHeight;
  }
  return elevation;
}
