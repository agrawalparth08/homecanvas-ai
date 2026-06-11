/**
 * Structural scene diff (Phase 7), pure. Summarizes what changed between two
 * scenes (current vs a saved variant, or pre/post re-extraction) for the
 * side-by-side comparison view: rooms added / removed / changed / recoloured,
 * and furniture added / removed / moved. Deterministic ordering.
 */
import type { FurnitureObject, HomeScene, Room, SceneDiff } from './schemas';

const allRooms = (s: HomeScene): Room[] => s.floors.flatMap((f) => f.rooms);
const allObjects = (s: HomeScene): FurnitureObject[] => s.floors.flatMap((f) => f.objects);

/** Material ids a room owns directly (floor + ceiling). Wall sides are shared. */
const roomColorSig = (r: Room): string => `${r.floorSurface?.materialId ?? ''}|${r.ceilingSurface?.materialId ?? ''}`;
const transformSig = (o: FurnitureObject): string =>
  `${o.transform.x},${o.transform.y},${o.transform.elevation},${o.transform.rotationY}`;

export function diffScenes(a: HomeScene, b: HomeScene): SceneDiff {
  const aRooms = new Map(allRooms(a).map((r) => [r.id, r]));
  const bRooms = new Map(allRooms(b).map((r) => [r.id, r]));

  const changedRooms: string[] = [];
  const recoloredRooms: string[] = [];
  for (const [id, ra] of aRooms) {
    const rb = bRooms.get(id);
    if (!rb) continue;
    if (JSON.stringify(ra) !== JSON.stringify(rb)) changedRooms.push(id);
    if (roomColorSig(ra) !== roomColorSig(rb)) recoloredRooms.push(id);
  }
  const addedRoomIds = [...bRooms.keys()].filter((id) => !aRooms.has(id)).sort();
  const removedRoomIds = [...aRooms.keys()].filter((id) => !bRooms.has(id)).sort();

  const aObj = new Map(allObjects(a).map((o) => [o.id, o]));
  const bObj = new Map(allObjects(b).map((o) => [o.id, o]));
  const addedObjectIds = [...bObj.keys()].filter((id) => !aObj.has(id)).sort();
  const removedObjectIds = [...aObj.keys()].filter((id) => !bObj.has(id)).sort();
  const movedObjectIds: string[] = [];
  for (const [id, oa] of aObj) {
    const ob = bObj.get(id);
    if (ob && transformSig(oa) !== transformSig(ob)) movedObjectIds.push(id);
  }
  movedObjectIds.sort();
  changedRooms.sort();
  recoloredRooms.sort();

  const nothing =
    changedRooms.length === 0 &&
    addedRoomIds.length === 0 &&
    removedRoomIds.length === 0 &&
    addedObjectIds.length === 0 &&
    removedObjectIds.length === 0 &&
    movedObjectIds.length === 0;

  const summary = nothing
    ? 'No differences.'
    : `${changedRooms.length} room(s) changed (${recoloredRooms.length} recoloured), ` +
      `${addedRoomIds.length}+/${removedRoomIds.length}- rooms, ` +
      `${addedObjectIds.length}+/${removedObjectIds.length}-/${movedObjectIds.length}~ furniture`;

  return {
    changedRooms,
    recoloredRooms,
    addedRoomIds,
    removedRoomIds,
    addedObjectIds,
    removedObjectIds,
    movedObjectIds,
    summary,
  };
}
