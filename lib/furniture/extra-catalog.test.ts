import { describe, expect, it } from 'vitest';
import { FurnitureCategory } from '../scene/schemas';
import { EXTRA_FURNITURE, isExtraCatalogKey } from './extra-catalog';

const VALID = new Set(FurnitureCategory.options);

describe('EXTRA_FURNITURE', () => {
  it('ships about ten entries', () => {
    expect(Object.keys(EXTRA_FURNITURE).length).toBeGreaterThanOrEqual(10);
  });

  it('every entry has a valid category, positive dims and a render kind', () => {
    for (const [key, item] of Object.entries(EXTRA_FURNITURE)) {
      expect(VALID.has(item.category), `${key} category`).toBe(true);
      expect(item.w, `${key} w`).toBeGreaterThan(0);
      expect(item.d, `${key} d`).toBeGreaterThan(0);
      expect(item.h, `${key} h`).toBeGreaterThan(0);
      expect(item.kind.length, `${key} kind`).toBeGreaterThan(0);
      expect(item.name.length, `${key} name`).toBeGreaterThan(0);
    }
  });

  it('every entry has a rectangular footprint with >= 3 points', () => {
    for (const [key, item] of Object.entries(EXTRA_FURNITURE)) {
      expect(Array.isArray(item.footprint), `${key} footprint array`).toBe(true);
      expect(item.footprint.length, `${key} footprint length`).toBeGreaterThanOrEqual(3);
      for (const p of item.footprint) {
        expect(Number.isFinite(p.x), `${key} footprint x`).toBe(true);
        expect(Number.isFinite(p.y), `${key} footprint y`).toBe(true);
      }
    }
  });

  it('footprint spans the declared w×d (centred on origin)', () => {
    for (const [key, item] of Object.entries(EXTRA_FURNITURE)) {
      const xs = item.footprint.map((p) => p.x);
      const ys = item.footprint.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs), `${key} width span`).toBeCloseTo(item.w);
      expect(Math.max(...ys) - Math.min(...ys), `${key} depth span`).toBeCloseTo(item.d);
    }
  });

  it('isExtraCatalogKey guards membership', () => {
    expect(isExtraCatalogKey('areaRug')).toBe(true);
    expect(isExtraCatalogKey('spaceship')).toBe(false);
  });
});
