import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { SceneLoadError, migrateSceneDocument } from './migrations';
import { SCHEMA_VERSION } from './schemas';

const CORPUS = path.resolve(import.meta.dirname, '../../tests/fixtures/schema-versions');

describe('scene migrations', () => {
  it('passes a current-version document through unchanged', () => {
    const scene = buildSampleHome();
    const migrated = migrateSceneDocument(JSON.parse(JSON.stringify(scene)));
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.id).toBe(scene.id);
  });

  it('rejects documents without a schemaVersion', () => {
    expect(() => migrateSceneDocument({ id: 'x' })).toThrow(SceneLoadError);
  });

  it('rejects documents from a newer app', () => {
    const doc = { ...JSON.parse(JSON.stringify(buildSampleHome())), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migrateSceneDocument(doc)).toThrow(/newer/);
  });

  it('rejects non-objects', () => {
    expect(() => migrateSceneDocument('nope')).toThrow(SceneLoadError);
  });

  // Every historical format gets a frozen fixture here; all must keep loading.
  it('migrates the whole fixture corpus cleanly', () => {
    const files = readdirSync(CORPUS).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(path.join(CORPUS, file), 'utf8'));
      const migrated = migrateSceneDocument(raw);
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    }
  });
});
