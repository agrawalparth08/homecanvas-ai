import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from '../scene/commit';
import { findMaterial, findRoom, findWall } from '../scene/selectors';
import { buildStylePackApplication, wallSideFacingRoom } from './apply';
import { getStylePack } from './style-packs';

describe('wallSideFacingRoom', () => {
  const scene = buildSampleHome();

  it('picks the interior side for long shared facade walls', () => {
    // Regression: w-ext-s spans the whole south facade; its midpoint sits
    // outside the living room (x 0..4500), which used to flip the side and
    // paint the building exterior.
    const living = findRoom(scene, 'room-living')!.room;
    const south = findWall(scene, 'w-ext-s')!.wall; // (0,0)->(10800,0), interior = +y = sideA
    expect(wallSideFacingRoom(south, living)).toBe('sideA');
  });

  it('picks opposite sides for rooms on either side of a partition', () => {
    const spine = findWall(scene, 'w-int-spine')!.wall; // (4500,0)->(4500,8400)
    const living = findRoom(scene, 'room-living')!.room; // west of the spine
    const dining = findRoom(scene, 'room-dining')!.room; // east of the spine
    const livingSide = wallSideFacingRoom(spine, living);
    const diningSide = wallSideFacingRoom(spine, dining);
    expect(livingSide).not.toBe(diningSide);
  });

  it('handles every room/wall pair in the sample without falling through', () => {
    for (const floor of scene.floors) {
      for (const room of floor.rooms) {
        for (const wallId of room.wallIds) {
          const wall = floor.walls.find((w) => w.id === wallId)!;
          // Just exercising the function — must terminate and return a side.
          expect(['sideA', 'sideB']).toContain(wallSideFacingRoom(wall, room));
        }
      }
    }
  });
});

describe('buildStylePackApplication roomOverrides', () => {
  it('applies a per-room-kind floor override that differs from the wet floor', () => {
    const base = getStylePack('indian-modern');
    const pack = {
      ...base,
      id: 'test-override',
      name: 'Test Override',
      roomOverrides: {
        kitchen: {
          floorMaterial: {
            name: 'Test Override Floor',
            category: 'ceramicTile' as const,
            baseColor: '#123456',
            pbr: { roughness: 0.5, metallic: 0, repeatScale: 500 },
            styleTags: ['test-override'],
          },
        },
      },
    };
    const s = buildSampleHome();
    const app = buildStylePackApplication(s, pack, 'wholeHome');
    const result = commit(s, app.patch!);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const kitchen = findRoom(result.scene, 'room-kitchen')!.room;
    // the override material (NOT the pack's generic wet floor) reaches the kitchen
    expect(findMaterial(result.scene, kitchen.floorSurface.materialId)!.name).toBe('Test Override Floor');
  });
});
