import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { prismsToBuffers, wallSolidToBuffers } from './extrusion';
import { buildStair } from './stairs';
import { buildWallNetwork } from './walls';

describe('extrusion buffers', () => {
  it('produces valid indexed buffers for every sample-home wall', () => {
    const scene = buildSampleHome();
    for (const floor of scene.floors) {
      for (const solid of buildWallNetwork(floor)) {
        const buf = wallSolidToBuffers(solid);
        expect(buf.positions.length).toBeGreaterThan(0);
        expect(buf.positions.length % 3).toBe(0);
        expect(buf.normals.length).toBe(buf.positions.length);
        expect(buf.uvs.length).toBe((buf.positions.length / 3) * 2);
        const vertexCount = buf.positions.length / 3;
        for (const idx of buf.indices) {
          expect(idx).toBeLessThan(vertexCount);
        }
        // groups exactly tile the index buffer
        const total = buf.groups.reduce((sum, g) => sum + g.count, 0);
        expect(total).toBe(buf.indices.length);
        expect(buf.groups.map((g) => g.materialIndex)).toEqual([0, 1, 2]);
      }
    }
  });

  it('produces buffers for stairs', () => {
    const scene = buildSampleHome();
    const stair = scene.floors[0]!.stairs[0]!;
    const buf = prismsToBuffers(buildStair(stair).prisms);
    expect(buf.positions.length).toBeGreaterThan(0);
    expect(buf.indices.length % 3).toBe(0);
  });

  it('maps plan mm to world meters with y-up', () => {
    const solid = buildWallNetwork({
      id: 'f0',
      name: 'F',
      level: 0,
      floorHeight: 3000,
      rooms: [],
      walls: [
        {
          id: 'w1',
          floorId: 'f0',
          path: { pts: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], bulges: [0] },
          thickness: 200,
          height: 3000,
          materialIds: { sideA: 'm', sideB: 'm' },
          source: { kind: 'sample', confidence: 1 },
        },
      ],
      openings: [],
      objects: [],
      stairs: [],
      lights: [],
    })[0]!;
    const buf = wallSolidToBuffers(solid);
    let maxY = -Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < buf.positions.length; i += 3) {
      maxX = Math.max(maxX, buf.positions[i]!);
      maxY = Math.max(maxY, buf.positions[i + 1]!);
    }
    expect(maxY).toBeCloseTo(3, 6); // 3000mm -> 3m up
    expect(maxX).toBeCloseTo(4, 6); // 4000mm -> 4m east
  });
});
