/**
 * One-click room auto-design (the "design this space for me" button). Built-in,
 * deterministic: picks a style pack suited to the room kind, applies it, then
 * places a sensible furniture set (collision-aware) — all as ONE ScenePatch
 * through the commit pipeline. No paid API; for free-form "design like THIS
 * photo" the assistant's Claude bridge is the richer path.
 */
import { CATALOG, placeFurnitureInRoom, uniqueFurnitureId, type CatalogKey } from '../furniture/catalog';
import { makePatch, type PatchOp, type ScenePatch } from '../scene/patching';
import type { HomeScene, Room, RoomKind } from '../scene/schemas';
import { lockedEntityIds } from '../scene/selectors';
import { buildStylePackApplication } from '../styles/apply';
import { getStylePack } from '../styles/style-packs';

const PACK_FOR_KIND: Partial<Record<RoomKind, string>> = {
  living: 'contemporary-luxury',
  bedroom: 'warm-minimal',
  masterBedroom: 'contemporary-luxury',
  kidsRoom: 'scandinavian-light',
  dining: 'indian-modern',
  study: 'mid-century-modern',
  foyer: 'indian-modern',
  pooja: 'rajasthani-heritage',
  kitchen: 'indian-modern',
};

const FURNITURE_FOR_KIND: Partial<Record<RoomKind, CatalogKey[]>> = {
  living: ['sofa', 'coffeeTable', 'tvUnit', 'plant'],
  bedroom: ['bed', 'wardrobe', 'plant'],
  masterBedroom: ['kingBed', 'wardrobe', 'armchair', 'plant'],
  kidsRoom: ['bed', 'wardrobe', 'bookshelf'],
  dining: ['diningTable', 'chair', 'chair', 'console'],
  study: ['bookshelf', 'diningTable', 'chair'],
  foyer: ['console', 'plant'],
  pooja: ['poojaUnit', 'plant'],
  terrace: ['plant'],
  balcony: ['plant'],
  kitchen: [], // restyle only — no kitchen furniture in the CC0 catalog
};

/** A style pack + collision-placed furniture for the room, as one agent patch. */
export function designRoomPatch(scene: HomeScene, room: Room): ScenePatch | null {
  const ops: PatchOp[] = [];
  const pack = getStylePack(PACK_FOR_KIND[room.kind] ?? 'indian-modern');
  const app = buildStylePackApplication(scene, pack, { roomIds: [room.id] }, 'skip');
  if (app.patch) ops.push(...app.patch.ops);

  // Furniture only into UNLOCKED rooms — place_furniture mutates room.furnitureIds,
  // which the lock gate would reject, sinking the whole (style + furniture) patch.
  const floor = scene.floors.find((f) => f.rooms.some((r) => r.id === room.id));
  if (floor && !lockedEntityIds(scene).has(room.id)) {
    const locked = lockedEntityIds(scene);
    const roomObjects = floor.objects.filter((o) => o.roomId === room.id);
    // Auto-delete the room's existing UNLOCKED furniture so a (re)design REPLACES the
    // set instead of stacking new pieces on top of the old ones. Locked pieces are kept.
    for (const o of roomObjects) {
      if (!locked.has(o.id)) ops.push({ type: 'remove_object', objectId: o.id });
    }
    let existing = roomObjects.filter((o) => locked.has(o.id)); // place the fresh set clear of kept pieces
    const used = new Set(floor.objects.map((o) => o.id)); // fresh ids vs everything currently present
    for (const key of FURNITURE_FOR_KIND[room.kind] ?? ['plant']) {
      const obj = placeFurnitureInRoom({
        id: uniqueFurnitureId(used, room.id),
        roomId: room.id,
        key,
        roomOuter: room.boundary.outer,
        existing,
      });
      if (obj) {
        ops.push({ type: 'place_furniture', object: obj });
        existing = [...existing, obj];
      }
    }
  }

  if (ops.length === 0) return null;
  return makePatch(`Auto-design ${room.name} — ${pack.name}`, ops, 'agent');
}

/** Human label for the pack a room would get (for the button tooltip). */
export const designPackName = (room: Room): string =>
  getStylePack(PACK_FOR_KIND[room.kind] ?? 'indian-modern').name;

export { CATALOG };
