import {
  DOOR_WIDTH_MAX_MM,
  DOOR_WIDTH_MIN_MM,
  MIN_WALL_STUB_MM,
  WALL_HEIGHT_MAX_MM,
  WALL_HEIGHT_MIN_MM,
  WALL_THICKNESS_MAX_MM,
  WALL_THICKNESS_MIN_MM,
} from '../geometry/constants';
import { dist } from '../geometry/vec';
import { wallCenterlineLength } from '../geometry/walls-shared';
import { HomeSceneSchema, type HomeScene } from './schemas';
import { allEntityIds } from './selectors';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  entityId?: string;
  message: string;
}

/**
 * Full-document validation: zod shape + referential integrity + geometry sanity.
 * This is the "slow tier" — the commit pipeline runs it on every commit for now
 * (scenes are small); if profiling ever says otherwise it becomes debounced.
 */
export function validateScene(scene: HomeScene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const shape = HomeSceneSchema.safeParse(scene);
  if (!shape.success) {
    issues.push({ severity: 'error', message: `schema: ${shape.error.message}` });
    return issues; // structural failure — nothing below is meaningful
  }

  const ids = allEntityIds(scene);
  const materialIds = new Set(scene.materials.map((m) => m.id));

  // global id uniqueness
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const floor of scene.floors) {
    const collect = [
      floor.id,
      ...floor.rooms.flatMap((r) => [r.id, r.floorSurface.id, ...(r.ceilingSurface ? [r.ceilingSurface.id] : [])]),
      ...floor.walls.map((w) => w.id),
      ...floor.openings.map((o) => o.id),
      ...floor.objects.map((o) => o.id),
      ...floor.stairs.map((s) => s.id),
      ...floor.lights.map((l) => l.id),
    ];
    for (const id of collect) {
      if (seen.has(id)) dup.add(id);
      seen.add(id);
    }
  }
  for (const m of scene.materials) {
    if (seen.has(m.id)) dup.add(m.id);
    seen.add(m.id);
  }
  for (const id of dup) {
    issues.push({ severity: 'error', entityId: id, message: `duplicate entity id "${id}"` });
  }

  const requireMaterial = (materialId: string, owner: string) => {
    if (!materialIds.has(materialId)) {
      issues.push({
        severity: 'error',
        entityId: owner,
        message: `references missing material "${materialId}"`,
      });
    }
  };

  for (const floor of scene.floors) {
    const wallById = new Map(floor.walls.map((w) => [w.id, w]));

    for (const wall of floor.walls) {
      if (wall.floorId !== floor.id) {
        issues.push({ severity: 'error', entityId: wall.id, message: 'wall.floorId mismatch with containing floor' });
      }
      const length = wallCenterlineLength(wall);
      if (length < MIN_WALL_STUB_MM) {
        issues.push({ severity: 'error', entityId: wall.id, message: `wall is degenerate (${length.toFixed(1)}mm long)` });
      }
      if (wall.thickness < WALL_THICKNESS_MIN_MM || wall.thickness > WALL_THICKNESS_MAX_MM) {
        issues.push({ severity: 'warning', entityId: wall.id, message: `unusual wall thickness ${wall.thickness}mm` });
      }
      if (wall.height < WALL_HEIGHT_MIN_MM || wall.height > WALL_HEIGHT_MAX_MM) {
        issues.push({ severity: 'warning', entityId: wall.id, message: `unusual wall height ${wall.height}mm` });
      }
      requireMaterial(wall.materialIds.sideA, wall.id);
      requireMaterial(wall.materialIds.sideB, wall.id);
    }

    // openings: per-wall interval checks (no overlap, inside wall, stubs kept)
    const byWall = new Map<string, typeof floor.openings>();
    for (const opening of floor.openings) {
      const wall = wallById.get(opening.wallId);
      if (!wall) {
        issues.push({ severity: 'error', entityId: opening.id, message: `opening references missing wall "${opening.wallId}"` });
        continue;
      }
      (byWall.get(opening.wallId) ?? byWall.set(opening.wallId, []).get(opening.wallId))!.push(opening);

      if (opening.headHeight <= opening.sillHeight) {
        issues.push({ severity: 'error', entityId: opening.id, message: 'opening headHeight must exceed sillHeight' });
      }
      if (opening.headHeight > wall.height) {
        issues.push({ severity: 'error', entityId: opening.id, message: 'opening extends above its wall' });
      }
      if (opening.kind === 'door' && (opening.width < DOOR_WIDTH_MIN_MM || opening.width > DOOR_WIDTH_MAX_MM)) {
        issues.push({ severity: 'warning', entityId: opening.id, message: `unusual door width ${opening.width}mm` });
      }
    }
    for (const [wallId, openings] of byWall) {
      const wall = wallById.get(wallId)!;
      const length = wallCenterlineLength(wall);
      const intervals = openings
        .map((o) => ({
          id: o.id,
          lo: o.u * length - o.width / 2,
          hi: o.u * length + o.width / 2,
        }))
        .sort((a, b) => a.lo - b.lo);
      for (const iv of intervals) {
        if (iv.lo < MIN_WALL_STUB_MM || iv.hi > length - MIN_WALL_STUB_MM) {
          issues.push({
            severity: 'error',
            entityId: iv.id,
            message: `opening does not fit inside wall (needs ${MIN_WALL_STUB_MM}mm stubs)`,
          });
        }
      }
      for (let i = 1; i < intervals.length; i++) {
        if (intervals[i]!.lo < intervals[i - 1]!.hi) {
          issues.push({
            severity: 'error',
            entityId: intervals[i]!.id,
            message: `opening overlaps "${intervals[i - 1]!.id}" on wall "${wallId}"`,
          });
        }
      }
    }

    for (const room of floor.rooms) {
      if (room.floorId !== floor.id) {
        issues.push({ severity: 'error', entityId: room.id, message: 'room.floorId mismatch with containing floor' });
      }
      for (const wallId of room.wallIds) {
        if (!wallById.has(wallId)) {
          issues.push({ severity: 'error', entityId: room.id, message: `room references missing wall "${wallId}"` });
        }
      }
      requireMaterial(room.floorSurface.materialId, room.id);
      if (room.ceilingSurface) requireMaterial(room.ceilingSurface.materialId, room.id);
      if (room.openToSky && room.ceilingSurface) {
        issues.push({ severity: 'warning', entityId: room.id, message: 'openToSky room has a ceiling surface' });
      }
      // boundary sanity: no duplicate consecutive points
      const outer = room.boundary.outer;
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i]!;
        const b = outer[(i + 1) % outer.length]!;
        if (dist(a, b) < 1) {
          issues.push({ severity: 'error', entityId: room.id, message: 'room boundary has duplicate consecutive points' });
          break;
        }
      }
      const furnitureIds = new Set(floor.objects.map((o) => o.id));
      for (const fid of room.furnitureIds) {
        if (!furnitureIds.has(fid)) {
          issues.push({ severity: 'error', entityId: room.id, message: `room references missing furniture "${fid}"` });
        }
      }
    }

    const roomIds = new Set(floor.rooms.map((r) => r.id));
    for (const obj of floor.objects) {
      if (!roomIds.has(obj.roomId)) {
        issues.push({ severity: 'error', entityId: obj.id, message: `furniture references missing room "${obj.roomId}"` });
      }
      for (const mid of obj.materialIds) requireMaterial(mid, obj.id);
    }

    for (const stair of floor.stairs) {
      requireMaterial(stair.materialId, stair.id);
      if (stair.crossFloorLink && !scene.floors.some((f) => f.id === stair.crossFloorLink!.upperFloorId)) {
        issues.push({ severity: 'error', entityId: stair.id, message: 'stair crossFloorLink references missing floor' });
      }
    }
  }

  for (const lock of scene.locks) {
    for (const id of lock.entityIds) {
      if (!ids.has(id)) {
        issues.push({ severity: 'warning', entityId: lock.id, message: `lock references missing entity "${id}"` });
      }
    }
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
