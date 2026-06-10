import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { findRoom, findWall } from '../scene/selectors';
import { wallSideFacingRoom } from './apply';

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
