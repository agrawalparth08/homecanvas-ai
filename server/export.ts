/**
 * Scene JSON export (Phase 7). Pure builder so it's unit-testable without HTTP.
 * Re-validates against HomeSceneSchema before emitting, so every export is
 * guaranteed re-importable through the existing PUT /api/scenes path.
 */
import { HomeSceneSchema, SCHEMA_VERSION, type HomeScene } from '../lib/scene/schemas';

export interface SceneExport {
  filename: string;
  json: string;
}

export function buildSceneExport(scene: HomeScene): SceneExport {
  // Throws if the scene is structurally invalid — never emit an unimportable file.
  const valid = HomeSceneSchema.parse(scene);
  const safeId = valid.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    filename: `${safeId}-v${SCHEMA_VERSION}.scene.json`,
    json: JSON.stringify(valid, null, 2),
  };
}
