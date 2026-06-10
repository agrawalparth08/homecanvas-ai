import { add, normalize, perp, scale, sub, lerp } from '../geometry/vec';
import { pointInPolygon } from '../geometry/rooms';
import { makePatch, type PatchOp, type ScenePatch } from '../scene/patching';
import type { HomeScene, Material, MaterialSpec, Room, StylePack, Wall } from '../scene/schemas';
import { findWall, lockedEntityIds } from '../scene/selectors';

/**
 * Style application: expands a style pack into a plain ScenePatch of primitive
 * ops. The commit pipeline stays the single gate — with onLocked:'skip' we
 * pre-filter locked entities (and report them); with 'fail' we emit everything
 * and let the lock gate reject the commit.
 */

export interface StyleApplication {
  patch: ScenePatch | null;
  /** Entities skipped because they (or their parts) are locked. */
  skipped: string[];
}

function packMaterialId(packId: string, slot: string): string {
  return `mat-pack-${packId}-${slot}`;
}

function materialOps(scene: HomeScene, pack: StylePack): { ops: PatchOp[]; ids: Record<string, string> } {
  const ops: PatchOp[] = [];
  const ids: Record<string, string> = {};
  const slots: [string, MaterialSpec | undefined][] = [
    ['wall', pack.wallPaint],
    ['accent', pack.accentWall],
    ['floor', pack.floorMaterial],
    ['wetfloor', pack.wetFloorMaterial],
    ['ceiling', pack.ceiling],
  ];
  for (const [slot, spec] of slots) {
    if (!spec) continue;
    const id = packMaterialId(pack.id, slot);
    ids[slot] = id;
    if (!scene.materials.some((m) => m.id === id)) {
      const material: Material = { ...spec, id, sourceReference: `stylepack:${pack.id}` };
      ops.push({ type: 'add_material', material });
    }
  }
  return { ops, ids };
}

/**
 * Which side of a wall faces the given room. Walls are shared between rooms
 * and often run past a room's extent (e.g. a full facade), so a single
 * midpoint probe is wrong — sample several points along the wall on BOTH
 * sides and return the first side that lands inside the room polygon.
 */
export function wallSideFacingRoom(wall: Wall, room: Room): 'sideA' | 'sideB' {
  const start = wall.path.pts[0]!;
  const end = wall.path.pts[wall.path.pts.length - 1]!;
  const dir = normalize(sub(end, start));
  const offset = wall.thickness; // one thickness off the centerline
  const n = perp(dir);
  for (const u of [0.5, 0.25, 0.75, 0.1, 0.9, 0.05, 0.95]) {
    const pt = lerp(start, end, u);
    if (pointInPolygon(add(pt, scale(n, offset)), room.boundary.outer)) return 'sideA';
    if (pointInPolygon(add(pt, scale(n, -offset)), room.boundary.outer)) return 'sideB';
  }
  return 'sideA';
}

const WET_KINDS = new Set(['kitchen', 'bathroom', 'utility', 'washArea']);

export function buildStylePackApplication(
  scene: HomeScene,
  pack: StylePack,
  target: { roomIds: string[] } | 'wholeHome',
  onLocked: 'skip' | 'fail' = 'skip',
): StyleApplication {
  const locked = lockedEntityIds(scene);
  const skipped: string[] = [];
  const { ops, ids } = materialOps(scene, pack);

  const allRooms = scene.floors.flatMap((f) => f.rooms);
  const rooms =
    target === 'wholeHome' ? allRooms : allRooms.filter((r) => target.roomIds.includes(r.id));

  let accentUsed = false;
  for (const room of rooms) {
    if (onLocked === 'skip' && locked.has(room.id)) {
      skipped.push(room.id);
      continue;
    }

    const override = pack.roomOverrides?.[room.kind];

    // floor
    const wantsWet = WET_KINDS.has(room.kind) && (ids['wetfloor'] || override?.floorMaterial);
    const floorMatId = wantsWet && ids['wetfloor'] ? ids['wetfloor'] : ids['floor'];
    if (floorMatId) {
      ops.push({
        type: 'assign_material_to_surface',
        surface: { kind: 'roomFloor', roomId: room.id },
        materialId: floorMatId,
      });
    }

    // walls: paint every wall side that faces this room; first room gets one accent wall
    let accentAssigned = false;
    for (const wallId of room.wallIds) {
      if (onLocked === 'skip' && locked.has(wallId)) {
        skipped.push(wallId);
        continue;
      }
      const found = findWall(scene, wallId);
      if (!found) continue;
      const side = wallSideFacingRoom(found.wall, room);
      const useAccent = !accentUsed && !accentAssigned && ids['accent'] && room.kind === 'living';
      ops.push({
        type: 'assign_material_to_surface',
        surface: { kind: 'wallSide', wallId, side },
        materialId: useAccent ? ids['accent']! : ids['wall']!,
      });
      if (useAccent) {
        accentAssigned = true;
        accentUsed = true;
      }
    }

    // ceiling
    if (ids['ceiling'] && room.ceilingSurface) {
      ops.push({
        type: 'assign_material_to_surface',
        surface: { kind: 'roomCeiling', roomId: room.id },
        materialId: ids['ceiling'],
      });
    }

    ops.push({
      type: 'set_room_style_tags',
      roomId: room.id,
      styleTags: [pack.id],
    });
  }

  const hasAssignments = ops.some((o) => o.type !== 'add_material');
  if (!hasAssignments) return { patch: null, skipped };

  const scopeLabel = target === 'wholeHome' ? 'whole home' : `${rooms.length} room(s)`;
  return {
    patch: makePatch(`Apply style "${pack.name}" to ${scopeLabel}`, ops),
    skipped,
  };
}
