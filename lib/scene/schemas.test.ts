import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { HomeSceneSchema, MaterialSchema, WallSchema, sourceSample } from './schemas';

describe('scene schemas', () => {
  it('parses the sample home', () => {
    const result = HomeSceneSchema.safeParse(buildSampleHome());
    expect(result.success).toBe(true);
  });

  it('rejects bad hex colors', () => {
    const material = {
      id: 'm1',
      name: 'Bad',
      category: 'paint',
      baseColor: 'red',
      pbr: { roughness: 0.5, metallic: 0, repeatScale: 1000 },
      styleTags: [],
    };
    expect(MaterialSchema.safeParse(material).success).toBe(false);
    expect(MaterialSchema.safeParse({ ...material, baseColor: '#ff0000' }).success).toBe(true);
  });

  it('rejects walls whose bulges do not match segment count', () => {
    const wall = {
      id: 'w1',
      floorId: 'f1',
      path: { pts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], bulges: [0, 0] },
      thickness: 115,
      height: 3000,
      materialIds: { sideA: 'm1', sideB: 'm1' },
      source: sourceSample(),
    };
    expect(WallSchema.safeParse(wall).success).toBe(false);
    expect(WallSchema.safeParse({ ...wall, path: { pts: wall.path.pts, bulges: [0] } }).success).toBe(true);
  });

  it('rejects scenes without floors', () => {
    const scene = { ...buildSampleHome(), floors: [] };
    expect(HomeSceneSchema.safeParse(scene).success).toBe(false);
  });
});
