import { polygonArea } from '../geometry/rooms';
import { wallCenterlineLength } from '../geometry/walls-shared';
import { wallSideFacingRoom } from '../styles/apply';
import type { HomeScene, Room } from '../scene/schemas';

/**
 * Bill-of-quantities extraction — the numbers a designer's estimate is built
 * from, derived straight from the scene graph so they always reconcile with
 * what the client sees in 3D. PURE: no I/O, deterministic, unit-tested.
 *
 * Honest scope: paint areas are gross wall-face area minus door/window cutouts
 * on that wall; skirting/trim, wastage factors, and openings' reveals are the
 * estimator's judgment — the CSV leaves a rate column and notes for that.
 */

const MM2_TO_M2 = 1e-6;

export interface RoomQuantities {
  roomId: string;
  roomName: string;
  floorAreaM2: number;
  floorMaterialId: string;
  /** Paint/finish area of the wall faces looking INTO this room, per material. */
  wallAreaByMaterialM2: Record<string, number>;
  ceilingAreaM2: number | null;
  ceilingMaterialId: string | null;
  /** Furniture schedule: display name -> count. */
  furniture: Record<string, number>;
}

export interface MaterialTotal {
  materialId: string;
  materialName: string;
  surface: 'floor' | 'wall' | 'ceiling';
  areaM2: number;
}

export interface SceneQuantities {
  rooms: RoomQuantities[];
  totals: MaterialTotal[];
}

function roomWallArea(scene: HomeScene, room: Room, floorId: string): Record<string, number> {
  const floor = scene.floors.find((f) => f.id === floorId);
  if (!floor) return {};
  const out: Record<string, number> = {};
  for (const wallId of room.wallIds) {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (!wall) continue;
    const side = wallSideFacingRoom(wall, room);
    const materialId = wall.materialIds[side];
    const grossMm2 = wallCenterlineLength(wall) * wall.height;
    let openingsMm2 = 0;
    for (const opening of floor.openings) {
      if (opening.wallId !== wall.id) continue;
      openingsMm2 += opening.width * Math.max(0, opening.headHeight - opening.sillHeight);
    }
    const net = Math.max(0, grossMm2 - openingsMm2) * MM2_TO_M2;
    out[materialId] = (out[materialId] ?? 0) + net;
  }
  return out;
}

export function sceneQuantities(scene: HomeScene): SceneQuantities {
  const rooms: RoomQuantities[] = [];
  const totalsMap = new Map<string, MaterialTotal>();
  const add = (materialId: string, surface: MaterialTotal['surface'], areaM2: number) => {
    if (areaM2 <= 0) return;
    const key = `${materialId}:${surface}`;
    const existing = totalsMap.get(key);
    if (existing) existing.areaM2 += areaM2;
    else {
      const name = scene.materials.find((m) => m.id === materialId)?.name ?? materialId;
      totalsMap.set(key, { materialId, materialName: name, surface, areaM2 });
    }
  };

  for (const floor of scene.floors) {
    for (const room of floor.rooms) {
      const holeArea = room.boundary.holes.reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0);
      const floorAreaM2 = Math.max(0, Math.abs(polygonArea(room.boundary.outer)) - holeArea) * MM2_TO_M2;
      const wallAreaByMaterialM2 = roomWallArea(scene, room, floor.id);
      const ceilingAreaM2 = room.ceilingSurface ? floorAreaM2 : null;

      const furniture: Record<string, number> = {};
      for (const obj of floor.objects) {
        if (obj.roomId !== room.id) continue;
        furniture[obj.name] = (furniture[obj.name] ?? 0) + 1;
      }

      rooms.push({
        roomId: room.id,
        roomName: room.name,
        floorAreaM2,
        floorMaterialId: room.floorSurface.materialId,
        wallAreaByMaterialM2,
        ceilingAreaM2,
        ceilingMaterialId: room.ceilingSurface?.materialId ?? null,
        furniture,
      });

      add(room.floorSurface.materialId, 'floor', floorAreaM2);
      for (const [materialId, area] of Object.entries(wallAreaByMaterialM2)) add(materialId, 'wall', area);
      if (ceilingAreaM2 !== null && room.ceilingSurface) add(room.ceilingSurface.materialId, 'ceiling', ceilingAreaM2);
    }
  }

  const totals = [...totalsMap.values()].sort((a, b) => b.areaM2 - a.areaM2);
  return { rooms, totals };
}
