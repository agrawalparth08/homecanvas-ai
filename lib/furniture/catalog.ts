/**
 * Procedural furniture catalog (Phase 5). Canonical pieces with real-world mm
 * dimensions and a procedural `kind` the renderer already understands
 * (ProceduralFurniture). CC0 glTF models attach later via `assetRef`; this
 * parametric set is the always-available, fully-offline fallback.
 *
 * `placeFurnitureInRoom` is collision-aware: it asks the geometry core for a
 * non-overlapping spot inside the room before producing a FurnitureObject.
 */
import type { FurnitureCategory, FurnitureObject } from '../scene/schemas';
import type { Vec2 } from '../geometry/vec';
import {
  findPlacement,
  rectFootprint,
  worldFootprint,
  type PlacementResult,
} from '../geometry/collision';

export interface CatalogItem {
  category: FurnitureCategory;
  name: string;
  /** Procedural mesh kind (see ProceduralFurniture). */
  kind: string;
  /** Footprint + height in mm. */
  w: number;
  d: number;
  h: number;
  /** CC0 glTF model key (manifest.models). Renders glTF if downloaded, else procedural. */
  model?: string;
}

export const CATALOG = {
  sofa: { category: 'sofa', name: '3-seat Sofa', kind: 'sofa', w: 2000, d: 900, h: 850, model: 'sofa' },
  loveseat: { category: 'sofa', name: '2-seat Sofa', kind: 'sofa', w: 1500, d: 880, h: 850, model: 'sofa' },
  armchair: { category: 'chair', name: 'Armchair', kind: 'chair', w: 800, d: 820, h: 820, model: 'armchair' },
  chair: { category: 'chair', name: 'Dining Chair', kind: 'chair', w: 480, d: 520, h: 900, model: 'chair' },
  bed: { category: 'bed', name: 'Queen Bed', kind: 'bed', w: 1600, d: 2050, h: 1100, model: 'bed' },
  kingBed: { category: 'bed', name: 'King Bed', kind: 'bed', w: 1830, d: 2050, h: 1100, model: 'bed' },
  wardrobe: { category: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 1800, d: 600, h: 2100, model: 'wardrobe' },
  diningTable: { category: 'diningTable', name: 'Dining Table', kind: 'diningTable', w: 1600, d: 900, h: 750, model: 'diningTable' },
  coffeeTable: { category: 'coffeeTable', name: 'Coffee Table', kind: 'table', w: 1100, d: 600, h: 420, model: 'coffeeTable' },
  tvUnit: { category: 'tvUnit', name: 'TV Unit', kind: 'tvUnit', w: 1800, d: 450, h: 500 },
  rug: { category: 'rug', name: 'Rug', kind: 'rug', w: 2400, d: 1600, h: 15 },
  plant: { category: 'plant', name: 'Potted Plant', kind: 'plant', w: 500, d: 500, h: 1400 },
  bookshelf: { category: 'storage', name: 'Bookshelf', kind: 'wardrobe', w: 900, d: 350, h: 1900, model: 'bookshelf' },
  console: { category: 'console', name: 'Console Table', kind: 'wardrobe', w: 1200, d: 400, h: 800, model: 'console' },
  poojaUnit: { category: 'poojaUnit', name: 'Pooja Unit', kind: 'wardrobe', w: 900, d: 500, h: 1500 },
} satisfies Record<string, CatalogItem>;

export type CatalogKey = keyof typeof CATALOG;

export const isCatalogKey = (k: string): k is CatalogKey => k in CATALOG;

/**
 * A furniture id guaranteed not to collide with `used` (pass the floor's object
 * ids). Mutates `used` so successive calls in one batch stay unique too. Count-
 * based ids break after a delete; this scans for the first free slot.
 */
export function uniqueFurnitureId(used: Set<string>, roomId: string): string {
  let n = 1;
  let id = `furn-${roomId}-${n}`;
  while (used.has(id)) id = `furn-${roomId}-${++n}`;
  used.add(id);
  return id;
}

/** Build a FurnitureObject for a catalog item at a known placement. */
export function makeFurniture(
  id: string,
  roomId: string,
  key: CatalogKey,
  placement: PlacementResult,
  materialIds: string[] = [],
): FurnitureObject {
  const item = CATALOG[key];
  const model = 'model' in item ? (item.model as string | undefined) : undefined;
  return {
    id,
    roomId,
    category: item.category,
    name: item.name,
    // glTF if its model is in the cache, else the procedural placeholder.
    ...(model ? { assetRef: model } : {}),
    procedural: { kind: item.kind },
    transform: { x: placement.x, y: placement.y, elevation: 0, rotationY: placement.rotationY },
    dimensions: { w: item.w, d: item.d, h: item.h },
    footprint: rectFootprint(item.w, item.d),
    materialIds,
    source: { kind: 'agent', confidence: 1 },
  };
}

/**
 * Collision-aware placement: find a free spot inside `roomOuter` clear of the
 * `existing` pieces, then build the object. Returns null if nothing fits.
 */
export function placeFurnitureInRoom(opts: {
  id: string;
  roomId: string;
  key: CatalogKey;
  roomOuter: Vec2[];
  existing: FurnitureObject[];
  gap?: number;
}): FurnitureObject | null {
  const item = CATALOG[opts.key];
  const obstacles = opts.existing.map(worldFootprint);
  const spot = findPlacement(opts.roomOuter, item.w, item.d, obstacles, opts.gap ? { gap: opts.gap } : {});
  return spot ? makeFurniture(opts.id, opts.roomId, opts.key, spot) : null;
}
