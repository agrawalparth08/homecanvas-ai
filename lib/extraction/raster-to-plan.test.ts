import { describe, it, expect } from 'vitest';
import { primitivePlanFromMask } from './raster-to-plan';
import { buildSceneFromPrimitives } from './build-scene';
import { validateScene } from '../scene/validation';

/** A hollow rectangle of wall pixels: `border`-thick frame around a w×h grid. */
function frameMask(w: number, h: number, border: number): boolean[][] {
  const mask: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) {
      row.push(x < border || x >= w - border || y < border || y >= h - border);
    }
    mask.push(row);
  }
  return mask;
}

describe('primitivePlanFromMask', () => {
  it('turns a hollow-rectangle mask into a raster-cv plan with 4 axis walls', () => {
    const plan = primitivePlanFromMask(frameMask(60, 50, 2), { mmPerPx: 100 });
    expect(plan.source).toBe('raster-cv');
    expect(plan.unitsToMm).toBe(1);
    expect(plan.walls).toHaveLength(4);
    // every wall is axis-aligned (one of the coordinate deltas is ~0)
    for (const wll of plan.walls) {
      const dx = Math.abs(wll.a.x - wll.b.x);
      const dy = Math.abs(wll.a.y - wll.b.y);
      expect(Math.min(dx, dy)).toBeLessThan(1);
    }
  });

  it('feeds the shared spine: builds a valid single-room scene', () => {
    const plan = primitivePlanFromMask(frameMask(60, 50, 2), { mmPerPx: 100 });
    const scene = buildSceneFromPrimitives(plan);
    expect(validateScene(scene).length).toBe(0); // no validation issues
    const floor = scene.floors[0]!;
    expect(floor.walls).toHaveLength(4);
    expect(floor.rooms.length).toBeGreaterThanOrEqual(1);
  });

  it('emits no walls for an all-empty mask', () => {
    const empty = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => false));
    expect(primitivePlanFromMask(empty, { mmPerPx: 100 }).walls).toHaveLength(0);
  });
});
