/**
 * Unified placeable furniture (lane IX). Merges the curated base `CATALOG`
 * (catalog.ts) with the procedural-only `EXTRA_FURNITURE` (extra-catalog.ts)
 * into one id-keyed map, then maps each `RoomKind` to a sensible default set of
 * placeable pieces. Base entries win on id collision (they carry curated glTF
 * `model` keys the extras lack), so dedup is base-first.
 *
 * Shape note: base CATALOG items have no `footprint` (it is derived at placement
 * by `makeFurniture`), while EXTRA_FURNITURE items precompute one. `ALL_FURNITURE`
 * keeps the looser base shape (`CatalogItem`) so both flow through the existing
 * `makeFurniture`/`placeFurnitureInRoom` helpers unchanged.
 */
import type { RoomKind } from '../scene/schemas';
import { CATALOG, type CatalogItem } from './catalog';
import { EXTRA_FURNITURE } from './extra-catalog';

/** A placeable item plus its stable id (the catalog key it came from). */
export interface AllFurnitureItem extends CatalogItem {
  /** Stable id = the originating catalog key. */
  id: string;
}

/**
 * Every placeable item, base + extra, deduped by id (base wins). Built once at
 * module load; the catalogs are static so this never needs invalidation.
 */
export const ALL_FURNITURE: readonly AllFurnitureItem[] = (() => {
  const byId = new Map<string, AllFurnitureItem>();
  // Base first so its curated entries take precedence on any id collision.
  for (const [id, item] of Object.entries(CATALOG)) {
    if (!byId.has(id)) byId.set(id, { id, ...item });
  }
  for (const [id, item] of Object.entries(EXTRA_FURNITURE)) {
    if (!byId.has(id)) byId.set(id, { id, ...item });
  }
  return Array.from(byId.values());
})();

/** Lookup index for O(1) `furnitureById`. */
const INDEX: ReadonlyMap<string, AllFurnitureItem> = new Map(
  ALL_FURNITURE.map((item) => [item.id, item]),
);

/** Resolve a placeable item by id, or undefined if unknown. */
export function furnitureById(id: string): AllFurnitureItem | undefined {
  return INDEX.get(id);
}

/**
 * Per-room-kind default placeable sets, by id. Ids must all resolve via
 * `furnitureById`. Kinds absent here fall back to `DEFAULT_SUGGESTION`.
 */
const SUGGESTIONS: Partial<Record<RoomKind, readonly string[]>> = {
  living: ['sofa', 'coffeeTable', 'tvUnit', 'floorLamp', 'rug'],
  bedroom: ['bed', 'wardrobe', 'nightstand'],
  masterBedroom: ['kingBed', 'twoDoorWardrobe', 'nightstand', 'sideTable'],
  kidsRoom: ['bed', 'wardrobe', 'studyBookshelf'],
  dining: ['diningTable', 'chair', 'areaRug'],
  kitchen: ['kitchenUnit'],
  study: ['studyBookshelf', 'loungeArmchair', 'floorLamp'],
  foyer: ['console', 'cornerPlant'],
  pooja: ['poojaUnit'],
  bathroom: ['bathroomFixture'],
  balcony: ['cornerPlant', 'loungeArmchair'],
  terrace: ['cornerPlant', 'loungeArmchair'],
};

/** A few generic pieces any room can take when no kind-specific set applies. */
const DEFAULT_SUGGESTION: readonly string[] = ['sideTable', 'cornerPlant', 'areaRug'];

/**
 * Suggest a sensible placeable set for a room kind. Only ids that resolve via
 * `furnitureById` are returned, so missing catalog entries (e.g. an unlisted
 * `kitchenUnit`) are silently skipped rather than breaking placement.
 */
export function suggestFurniture(kind: RoomKind): AllFurnitureItem[] {
  const ids = SUGGESTIONS[kind] ?? DEFAULT_SUGGESTION;
  const items = ids
    .map(furnitureById)
    .filter((item): item is AllFurnitureItem => item !== undefined);
  // Never hand back an empty set: fall back to whatever generics resolve.
  if (items.length > 0) return items;
  return DEFAULT_SUGGESTION.map(furnitureById).filter(
    (item): item is AllFurnitureItem => item !== undefined,
  );
}
