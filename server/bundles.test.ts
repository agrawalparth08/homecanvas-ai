import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSampleHome } from '../lib/fixtures/sample-home';
import type * as BundlesModule from './bundles';
import type * as StorageModule from './storage';

/**
 * .hcproj bundle export/import (server/bundles.ts). Same temp-dir +
 * fresh-import pattern as storage-projects.test.ts. The variant-id filename
 * guard is the security-relevant case: EntityId is any non-empty string, so a
 * hostile bundle can carry a traversal id — it must be re-minted, never used
 * as a path.
 */

const ORIGINAL_DATA_DIR = process.env.HOMECANVAS_DATA_DIR;

let tempDir: string;
let storage: typeof StorageModule;
let bundles: typeof BundlesModule;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hc-bundles-'));
  process.env.HOMECANVAS_DATA_DIR = tempDir;
  vi.resetModules();
  storage = await import('./storage');
  bundles = await import('./bundles');
});

afterEach(async () => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.HOMECANVAS_DATA_DIR;
  else process.env.HOMECANVAS_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

function sampleVariant(projectId: string, id: string) {
  const scene = buildSampleHome();
  return {
    meta: { schemaVersion: scene.schemaVersion, id, projectId, name: `Variant ${id}`, styleTags: ['test'], createdAt: new Date().toISOString() },
    scene,
  };
}

describe('exportBundle', () => {
  it('packs scene + variants + meta, and returns null without a scene', async () => {
    const project = await storage.createProject('Client A', 'apartment');
    expect(await bundles.exportBundle(project.id)).toBeNull();

    await storage.saveScene(project.id, { ...buildSampleHome(), id: project.id, name: project.name });
    await storage.saveVariant(project.id, sampleVariant(project.id, 'v-one'));

    const bundle = await bundles.exportBundle(project.id);
    expect(bundle).not.toBeNull();
    expect(bundle!.format).toBe('hcproj');
    expect(bundle!.name).toBe('Client A');
    expect(bundle!.kind).toBe('apartment');
    expect(bundle!.variants).toHaveLength(1);
  });
});

describe('importBundle', () => {
  it('round-trips: new project, scene + variants re-homed', async () => {
    const source = await storage.createProject('Original');
    await storage.saveScene(source.id, { ...buildSampleHome(), id: source.id, name: source.name });
    await storage.saveVariant(source.id, sampleVariant(source.id, 'v-keep'));
    const bundle = await bundles.exportBundle(source.id);

    const result = await bundles.importBundle(bundle);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.id).not.toBe(source.id);
    expect(result.variantsImported).toBe(1);

    const scene = await storage.loadScene(result.project.id);
    expect(scene?.id).toBe(result.project.id);
    const variants = await storage.listVariants(result.project.id);
    expect(variants).toHaveLength(1);
    expect(variants[0]!.projectId).toBe(result.project.id);
  });

  it('always creates a fresh project — importing twice never collides', async () => {
    const source = await storage.createProject('Twice');
    await storage.saveScene(source.id, { ...buildSampleHome(), id: source.id, name: source.name });
    const bundle = await bundles.exportBundle(source.id);
    const a = await bundles.importBundle(bundle);
    const b = await bundles.importBundle(bundle);
    expect(a.ok && b.ok && a.project.id !== b.project.id).toBe(true);
  });

  it('rejects non-bundles and invalid scenes', async () => {
    expect((await bundles.importBundle({ hello: 'world' })).ok).toBe(false);
    expect((await bundles.importBundle('not even an object')).ok).toBe(false);
    const badScene = await bundles.importBundle({ format: 'hcproj', version: 1, name: 'X', scene: { nope: true }, variants: [] });
    expect(badScene.ok).toBe(false);
  });

  it('re-mints traversal variant ids instead of using them as filenames', async () => {
    const evil = sampleVariant('whatever', '../../evil');
    const result = await bundles.importBundle({
      format: 'hcproj',
      version: 1,
      name: 'Hostile',
      scene: buildSampleHome(),
      variants: [evil],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variantsImported).toBe(1);
    // Nothing escaped the variants dir…
    expect(existsSync(path.join(tempDir, '.homecanvas', 'evil.variant.json'))).toBe(false);
    expect(existsSync(path.join(tempDir, 'evil.variant.json'))).toBe(false);
    // …and the re-minted variant is loadable through the normal path.
    const variants = await storage.listVariants(result.project.id);
    expect(variants).toHaveLength(1);
    expect(variants[0]!.id).toMatch(/^v-/);
    const files = await readdir(path.join(tempDir, '.homecanvas', 'projects', result.project.id, 'variants'));
    expect(files.every((f) => !f.includes('..'))).toBe(true);
  });

  it('skips unparseable variants but keeps the good ones', async () => {
    const good = sampleVariant('x', 'v-good');
    const result = await bundles.importBundle({
      format: 'hcproj',
      version: 1,
      name: 'Mixed',
      scene: buildSampleHome(),
      variants: [good, { garbage: true }],
    });
    expect(result.ok && result.variantsImported === 1 && result.variantsSkipped === 1).toBe(true);
  });
});
