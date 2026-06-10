import { SCHEMA_VERSION, HomeSceneSchema, type HomeScene } from './schemas';

/**
 * Every persisted artifact (scene, variant, patch-log entry) is stamped with
 * `schemaVersion`. Loading always runs the migration chain BEFORE zod parsing,
 * so old saved homes keep opening as the format evolves.
 *
 * Rules:
 *  - Migrations are pure (unknown -> unknown) and run in version order.
 *  - Never delete a migration once shipped.
 *  - Every schema change adds a fixture to tests/fixtures/schema-versions/
 *    that must migrate cleanly (enforced by migrations.test.ts).
 */

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** Migration from version N is stored at key N and produces version N+1. */
export const SCENE_MIGRATIONS: Record<number, Migration> = {
  // v1 is current — first migration lands together with SCHEMA_VERSION 2.
};

export class SceneLoadError extends Error {}

export function migrateSceneDocument(raw: unknown): HomeScene {
  if (typeof raw !== 'object' || raw === null) {
    throw new SceneLoadError('scene document is not an object');
  }
  let doc = raw as Record<string, unknown>;
  const version = doc['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SceneLoadError('scene document has no valid schemaVersion');
  }
  if (version > SCHEMA_VERSION) {
    throw new SceneLoadError(
      `scene schemaVersion ${version} is newer than this app supports (${SCHEMA_VERSION})`,
    );
  }
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const migrate = SCENE_MIGRATIONS[v];
    if (!migrate) {
      throw new SceneLoadError(`missing migration from schemaVersion ${v}`);
    }
    doc = migrate(doc);
    doc['schemaVersion'] = v + 1;
  }
  const parsed = HomeSceneSchema.safeParse(doc);
  if (!parsed.success) {
    throw new SceneLoadError(`scene failed validation after migration: ${parsed.error.message}`);
  }
  return parsed.data;
}
