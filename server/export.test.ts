import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../lib/fixtures/sample-home';
import { HomeSceneSchema, SCHEMA_VERSION } from '../lib/scene/schemas';
import { hasErrors, validateScene } from '../lib/scene/validation';
import { buildSceneExport } from './export';

describe('buildSceneExport', () => {
  it('produces JSON that re-parses through HomeSceneSchema', () => {
    const { json } = buildSceneExport(buildSampleHome());
    expect(HomeSceneSchema.safeParse(JSON.parse(json)).success).toBe(true);
  });

  it('embeds the scene id and schema version in the filename', () => {
    const scene = buildSampleHome();
    const { filename } = buildSceneExport(scene);
    expect(filename).toBe(`${scene.id}-v${SCHEMA_VERSION}.scene.json`);
  });

  it('round-trips: export -> parse -> validate with zero errors (import integrity)', () => {
    const { json } = buildSceneExport(buildSampleHome());
    const reparsed = HomeSceneSchema.parse(JSON.parse(json));
    expect(hasErrors(validateScene(reparsed))).toBe(false);
  });

  it('is deterministic for the same scene', () => {
    const scene = buildSampleHome();
    expect(buildSceneExport(scene).json).toBe(buildSceneExport(scene).json);
  });

  it('throws on a structurally invalid scene rather than emitting a bad file', () => {
    expect(() => buildSceneExport({ id: 'broken' } as never)).toThrow();
  });

  it('sanitizes an unsafe id into a filesystem-safe filename', () => {
    const scene = { ...buildSampleHome(), id: 'my home/2024' };
    expect(buildSceneExport(scene).filename).toBe(`my_home_2024-v${SCHEMA_VERSION}.scene.json`);
  });

  it('preserves locks through an export round-trip (re-importable, locks and all)', () => {
    const base = buildSampleHome();
    const roomId = base.floors[0]!.rooms[0]!.id;
    const scene = {
      ...base,
      locks: [{ id: 'lock-1', entityIds: [roomId], createdAt: '2026-06-11T00:00:00.000Z' }],
    };
    const { json } = buildSceneExport(scene);
    const reparsed = HomeSceneSchema.parse(JSON.parse(json));
    expect(reparsed.locks).toEqual(scene.locks);
  });
});
