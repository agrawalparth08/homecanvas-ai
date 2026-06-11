import { describe, expect, it } from 'vitest';
import { FurnitureSchema } from '../scene/schemas';
import { CURATED_FURNITURE } from '../assets/manifest';
import { convexOverlap, worldFootprint } from '../geometry/collision';
import { CATALOG, isCatalogKey, makeFurniture, placeFurnitureInRoom, uniqueFurnitureId, type CatalogItem } from './catalog';

const ROOM = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 5000 },
  { x: 0, y: 5000 },
];

describe('catalog', () => {
  it('every entry has positive dimensions and a render kind', () => {
    for (const [, item] of Object.entries(CATALOG)) {
      expect(item.w).toBeGreaterThan(0);
      expect(item.d).toBeGreaterThan(0);
      expect(item.h).toBeGreaterThan(0);
      expect(item.kind.length).toBeGreaterThan(0);
    }
  });
  it('isCatalogKey guards unknown keys', () => {
    expect(isCatalogKey('sofa')).toBe(true);
    expect(isCatalogKey('spaceship')).toBe(false);
  });

  it('every curated glTF model is referenced by at least one catalog item', () => {
    const items = Object.values(CATALOG) as CatalogItem[];
    for (const m of CURATED_FURNITURE) {
      expect(items.some((i) => i.model === m.key), m.key).toBe(true);
    }
  });
});

describe('uniqueFurnitureId', () => {
  it('returns the first free slot and stays unique across calls (survives deletes)', () => {
    const used = new Set(['furn-r-1', 'furn-r-2', 'furn-r-4']); // 'furn-r-3' was deleted
    expect(uniqueFurnitureId(used, 'r')).toBe('furn-r-3');
    expect(uniqueFurnitureId(used, 'r')).toBe('furn-r-5'); // 3 now taken, skip 4
  });
});

describe('makeFurniture assetRef', () => {
  it('sets assetRef for a modeled piece and omits it for a procedural-only one', () => {
    expect(makeFurniture('f', 'r', 'sofa', { x: 0, y: 0, rotationY: 0 }).assetRef).toBe('sofa');
    expect(makeFurniture('f', 'r', 'tvUnit', { x: 0, y: 0, rotationY: 0 }).assetRef).toBeUndefined();
  });
});

describe('makeFurniture', () => {
  it('produces a schema-valid FurnitureObject', () => {
    const obj = makeFurniture('f1', 'r1', 'sofa', { x: 1000, y: 1000, rotationY: 0 });
    expect(FurnitureSchema.safeParse(obj).success).toBe(true);
    expect(obj.dimensions.w).toBe(CATALOG.sofa.w);
    expect(obj.footprint).toHaveLength(4);
  });
});

describe('placeFurnitureInRoom', () => {
  it('places a sofa in an empty room', () => {
    const obj = placeFurnitureInRoom({ id: 'f1', roomId: 'r1', key: 'sofa', roomOuter: ROOM, existing: [] });
    expect(obj).not.toBeNull();
    expect(FurnitureSchema.safeParse(obj).success).toBe(true);
  });
  it('places a second piece genuinely clear of the first (no footprint overlap)', () => {
    const first = placeFurnitureInRoom({ id: 'f1', roomId: 'r1', key: 'sofa', roomOuter: ROOM, existing: [] })!;
    const second = placeFurnitureInRoom({ id: 'f2', roomId: 'r1', key: 'armchair', roomOuter: ROOM, existing: [first] });
    expect(second).not.toBeNull();
    // the placement must actually avoid the first piece, not just get a new id
    expect(convexOverlap(worldFootprint(first), worldFootprint(second!))).toBe(false);
  });
  it('returns null when the piece cannot fit', () => {
    const tiny = [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 800 },
      { x: 0, y: 800 },
    ];
    expect(placeFurnitureInRoom({ id: 'f1', roomId: 'r1', key: 'diningTable', roomOuter: tiny, existing: [] })).toBeNull();
  });
});
