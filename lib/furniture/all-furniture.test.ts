import { describe, expect, it } from 'vitest';
import { RoomKind } from '../scene/schemas';
import { CATALOG } from './catalog';
import { EXTRA_FURNITURE } from './extra-catalog';
import { ALL_FURNITURE, furnitureById, suggestFurniture } from './all-furniture';

describe('ALL_FURNITURE', () => {
  it('includes every base catalog item', () => {
    for (const id of Object.keys(CATALOG)) {
      expect(furnitureById(id)).toBeDefined();
    }
  });

  it('includes every extra item', () => {
    for (const id of Object.keys(EXTRA_FURNITURE)) {
      expect(furnitureById(id)).toBeDefined();
    }
  });

  it('has no duplicate ids', () => {
    const ids = ALL_FURNITURE.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers base + extra counts (base wins on any id collision)', () => {
    const merged = new Set([
      ...Object.keys(CATALOG),
      ...Object.keys(EXTRA_FURNITURE),
    ]);
    expect(ALL_FURNITURE.length).toBe(merged.size);
  });

  it('each item resolves to itself via furnitureById', () => {
    for (const item of ALL_FURNITURE) {
      expect(furnitureById(item.id)).toBe(item);
    }
  });
});

describe('furnitureById', () => {
  it('returns undefined for an unknown id', () => {
    expect(furnitureById('definitely-not-a-real-id')).toBeUndefined();
  });
});

describe('suggestFurniture', () => {
  it('suggests a bed for a bedroom', () => {
    const suggested = suggestFurniture('bedroom');
    expect(suggested.some((item) => item.category === 'bed')).toBe(true);
  });

  it('suggests a sofa for a living room', () => {
    const suggested = suggestFurniture('living');
    expect(suggested.some((item) => item.category === 'sofa')).toBe(true);
  });

  it('suggests a dining table for a dining room', () => {
    const suggested = suggestFurniture('dining');
    expect(suggested.some((item) => item.category === 'diningTable')).toBe(true);
  });

  it('never returns an empty set for any room kind', () => {
    for (const kind of RoomKind.options) {
      expect(suggestFurniture(kind).length).toBeGreaterThan(0);
    }
  });

  it('only returns ids that resolve via furnitureById, for every room kind', () => {
    for (const kind of RoomKind.options) {
      for (const item of suggestFurniture(kind)) {
        expect(furnitureById(item.id)).toBe(item);
      }
    }
  });
});
