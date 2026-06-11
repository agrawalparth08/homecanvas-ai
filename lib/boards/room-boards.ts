/**
 * Room design boards (Phase 7), pure. For each room, collect its assigned
 * materials (floor/ceiling/wall sides), a deduped palette, its furniture, and
 * style tags — the data layer under the Variants page board grid. The path-
 * traced still per board is a deferred GPU enhancement; this descriptor is not.
 */
import type { HomeScene, RoomBoard } from '../scene/schemas';
import { findMaterial, findWall } from '../scene/selectors';

export function buildRoomBoards(scene: HomeScene): RoomBoard[] {
  const boards: RoomBoard[] = [];
  for (const floor of scene.floors) {
    for (const room of floor.rooms) {
      const matIds = new Set<string>();
      if (room.floorSurface?.materialId) matIds.add(room.floorSurface.materialId);
      if (room.ceilingSurface?.materialId) matIds.add(room.ceilingSurface.materialId);
      for (const wallId of room.wallIds) {
        const found = findWall(scene, wallId);
        if (!found) continue;
        if (found.wall.materialIds.sideA) matIds.add(found.wall.materialIds.sideA);
        if (found.wall.materialIds.sideB) matIds.add(found.wall.materialIds.sideB);
      }

      const materials = [...matIds]
        .sort()
        .map((id) => findMaterial(scene, id))
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map((m) => ({ id: m.id, name: m.name, baseColor: m.baseColor }));

      const palette: string[] = [];
      for (const m of materials) if (!palette.includes(m.baseColor)) palette.push(m.baseColor);

      const furniture = floor.objects
        .filter((o) => o.roomId === room.id)
        .map((o) => ({ id: o.id, name: o.name, category: o.category }));

      boards.push({
        roomId: room.id,
        name: room.name,
        kind: room.kind,
        palette,
        materials,
        furniture,
        styleTags: room.styleTags ?? [],
      });
    }
  }
  return boards;
}
