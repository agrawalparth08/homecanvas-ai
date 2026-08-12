import { z } from 'zod';
import { DesignVariantSchema, HomeSceneSchema, type DesignVariant } from '../lib/scene/schemas';
import {
  createProject,
  listVariants,
  loadScene,
  loadVariant,
  readProjectMeta,
  saveScene,
  saveVariant,
  type ProjectId,
  type ProjectMeta,
} from './storage';

/**
 * .hcproj project bundles — one portable JSON file holding a whole project
 * (scene + every saved variant + display meta) so designers can archive a
 * client job, move machines, or hand a project to a collaborator. Plain JSON
 * (no zip): human-inspectable, diffable, and importable with nothing but this
 * validator. Import always creates a NEW project — it never overwrites.
 */

export const HCPROJ_VERSION = 1;

export interface ProjectBundle {
  format: 'hcproj';
  version: number;
  exportedAt: string;
  name: string;
  kind: ProjectMeta['kind'];
  scene: unknown;
  variants: unknown[];
}

export async function exportBundle(projectId: ProjectId): Promise<ProjectBundle | null> {
  const scene = await loadScene(projectId);
  if (!scene) return null;
  const meta = await readProjectMeta(projectId);
  const variants: DesignVariant[] = [];
  for (const v of await listVariants(projectId)) {
    const full = await loadVariant(projectId, v.id);
    if (full) variants.push(full);
  }
  return {
    format: 'hcproj',
    version: HCPROJ_VERSION,
    exportedAt: new Date().toISOString(),
    name: meta?.name ?? scene.name,
    kind: meta?.kind === 'apartment' ? 'apartment' : 'home',
    scene,
    variants,
  };
}

// Untrusted input: someone else's .hcproj file. The envelope is validated
// here; the scene itself by HomeSceneSchema. Variant ids become filenames, so
// anything unsafe gets the whole variant re-minted rather than trusted.
const BundleEnvelopeSchema = z.object({
  format: z.literal('hcproj'),
  version: z.literal(HCPROJ_VERSION),
  name: z.string().min(1).max(200),
  kind: z.enum(['home', 'apartment', 'sample']).optional(),
  scene: z.unknown(),
  variants: z.array(z.unknown()).max(200).optional(),
});

const SAFE_VARIANT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export type ImportResult =
  | { ok: true; project: ProjectMeta; variantsImported: number; variantsSkipped: number }
  | { ok: false; reason: string };

export async function importBundle(raw: unknown): Promise<ImportResult> {
  const envelope = BundleEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { ok: false, reason: 'Not a HomeCanvas project bundle (.hcproj) — or a newer format than this app understands.' };
  }
  const scene = HomeSceneSchema.safeParse(envelope.data.scene);
  if (!scene.success) {
    return { ok: false, reason: `The bundle's scene failed validation: ${scene.error.issues[0]?.message ?? 'invalid scene'}` };
  }

  const kind = envelope.data.kind === 'apartment' ? 'apartment' : 'home';
  const project = await createProject(envelope.data.name, kind);
  // Re-home: the scene keeps its content but belongs to the new project.
  await saveScene(project.id, { ...scene.data, id: project.id, name: project.name });

  let imported = 0;
  let skipped = 0;
  for (const rawVariant of envelope.data.variants ?? []) {
    const parsed = DesignVariantSchema.safeParse(rawVariant);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const variant = parsed.data;
    variant.meta.projectId = project.id;
    if (!SAFE_VARIANT_ID.test(variant.meta.id)) {
      variant.meta.id = `v-${Date.now().toString(36)}${imported.toString(36)}`;
    }
    await saveVariant(project.id, variant);
    imported += 1;
  }
  return { ok: true, project, variantsImported: imported, variantsSkipped: skipped };
}
