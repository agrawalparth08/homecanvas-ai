import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from '../scene/commit';
import { MATERIAL_LIBRARY } from '../styles/material-library';
import { buildPaletteOps, type PaletteInput } from './palette-apply';
import { proposePaletteEdit } from './mock-provider';

const INPUT: PaletteInput = {
  swatches: [
    { hex: '#eeeee0', weight: 0.5 }, // lightest → walls
    { hex: '#3a3a3a', weight: 0.3 },
    { hex: '#a8542f', weight: 0.2 },
  ],
  candidates: [{ materialId: 'mat-floor-walnut', hex: '#6b4a32', weight: 0.2, distance: 1, metric: 'cielab' }],
};

describe('buildPaletteOps', () => {
  const scene = buildSampleHome();
  const room = scene.floors[0]!.rooms[0]!;

  it('recolours walls with the lightest tone and assigns the nearest floor material', () => {
    const ops = buildPaletteOps(scene, room, INPUT, 'all');
    const wall = ops.find((o) => o.type === 'set_surface_color');
    expect(wall && 'color' in wall ? wall.color : null).toBe('#eeeee0');
    expect(ops.some((o) => o.type === 'assign_material_to_surface' && o.materialId === 'mat-floor-walnut')).toBe(true);
  });

  it('narrows to walls only when asked', () => {
    const ops = buildPaletteOps(scene, room, INPUT, 'walls');
    expect(ops.every((o) => o.type === 'set_surface_color')).toBe(true);
  });
});

describe('proposePaletteEdit', () => {
  it('produces a committable recolour for a named room', async () => {
    const scene = buildSampleHome();
    const room = scene.floors[0]!.rooms[0]!;
    const ps = await proposePaletteEdit(`recolour the ${room.name} from this`, { scene }, INPUT);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.patch.ops.some((o) => o.type === 'set_surface_color')).toBe(true);
    expect(commit(scene, ps[0]!.patch).ok).toBe(true);
  });

  it('dedupes the borrowed floor material across a whole-home apply, and commits', async () => {
    const scene = buildSampleHome();
    const ps = await proposePaletteEdit('apply this palette to the whole home', { scene }, INPUT);
    expect(ps).toHaveLength(1);
    const addMat = ps[0]!.patch.ops.filter((o) => o.type === 'add_material' && o.material.id === 'mat-floor-walnut');
    expect(addMat.length).toBeLessThanOrEqual(1);
    expect(commit(scene, ps[0]!.patch).ok).toBe(true);
  });

  it('needs a room (or whole-home) — returns nothing otherwise', async () => {
    expect(await proposePaletteEdit('use these colours', { scene: buildSampleHome() }, INPUT)).toEqual([]);
  });

  it('never freezes/mutates the shared MATERIAL_LIBRARY on commit (borrows a clone)', async () => {
    const scene = buildSampleHome();
    const room = scene.floors[0]!.rooms[0]!;
    const ps = await proposePaletteEdit(`recolour the ${room.name} from this`, { scene }, INPUT);
    const result = commit(scene, ps[0]!.patch);
    expect(result.ok).toBe(true);
    const lib = MATERIAL_LIBRARY.find((m) => m.id === 'mat-floor-walnut')!;
    expect(Object.isFrozen(lib)).toBe(false);
    expect(Object.isFrozen(lib.pbr)).toBe(false);
  });
});
