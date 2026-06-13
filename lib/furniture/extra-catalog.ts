/**
 * Extra placeable house items (Phase 6+), same shape as `catalog.ts`'s CATALOG
 * so they flow through `makeFurniture`/`placeFurnitureInRoom` unchanged. These
 * are procedural-only pieces (no curated glTF `model`): always-offline, real-
 * world mm dimensions, rectangular footprints. Categories are valid
 * FurnitureCategory enum members.
 *
 * Keep keys distinct from CATALOG so the two sets can be spread into one map by
 * the main session without collisions.
 */
import type { CatalogItem } from './catalog';
import { rectFootprint } from '../geometry/collision';
import type { Vec2 } from '../geometry/vec';

/** Extra catalog entry: a CatalogItem plus its precomputed local footprint. */
export interface ExtraCatalogItem extends CatalogItem {
  /** Local-space rectangular footprint (origin at transform, unrotated). */
  footprint: Vec2[];
}

/** Build an entry, deriving the rectangular footprint from w×d. */
function entry(
  category: CatalogItem['category'],
  name: string,
  kind: string,
  w: number,
  d: number,
  h: number,
): ExtraCatalogItem {
  return { category, name, kind, w, d, h, footprint: rectFootprint(w, d) };
}

export const EXTRA_FURNITURE = {
  studyBookshelf: entry('storage', 'Tall Bookshelf', 'wardrobe', 800, 300, 2000),
  twoDoorWardrobe: entry('wardrobe', '2-Door Wardrobe', 'wardrobe', 1000, 600, 2100),
  roundCoffeeTable: entry('coffeeTable', 'Round Coffee Table', 'table', 900, 900, 400),
  lowTvUnit: entry('tvUnit', 'Low TV Unit', 'tvUnit', 1600, 400, 450),
  loungeArmchair: entry('chair', 'Lounge Armchair', 'chair', 850, 850, 800),
  sideTable: entry('console', 'Side Table', 'wardrobe', 450, 450, 550),
  areaRug: entry('rug', 'Area Rug', 'rug', 2000, 1400, 12),
  floorLamp: entry('light', 'Floor Lamp', 'plant', 350, 350, 1600),
  cornerPlant: entry('plant', 'Corner Plant', 'plant', 600, 600, 1500),
  nightstand: entry('storage', 'Nightstand', 'wardrobe', 450, 400, 550),
} satisfies Record<string, ExtraCatalogItem>;

export type ExtraCatalogKey = keyof typeof EXTRA_FURNITURE;

/** Type guard for an extra-catalog key. */
export const isExtraCatalogKey = (k: string): k is ExtraCatalogKey =>
  k in EXTRA_FURNITURE;
