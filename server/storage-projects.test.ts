import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSampleHome } from '../lib/fixtures/sample-home';
import type * as StorageModule from './storage';

/**
 * Multi-project workspace core (server/storage.ts): id validation, create/list/
 * rename/duplicate, and generic-project scene round-trips. Same temp-dir +
 * fresh-import pattern as storage-myhome.test.ts — the real data dirs are
 * never touched.
 */

const ORIGINAL_DATA_DIR = process.env.HOMECANVAS_DATA_DIR;

let tempDir: string;
let storage: typeof StorageModule;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hc-storage-projects-'));
  process.env.HOMECANVAS_DATA_DIR = tempDir;
  vi.resetModules();
  storage = await import('./storage');
});

afterEach(async () => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.HOMECANVAS_DATA_DIR;
  else process.env.HOMECANVAS_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

describe('isProjectId — path safety', () => {
  it('accepts slugs and the built-ins', () => {
    for (const ok of ['sample-home', 'my-home', 'p-abc123', 'client-4', 'a']) {
      expect(storage.isProjectId(ok)).toBe(true);
    }
  });
  it('rejects anything that could escape the projects dir', () => {
    for (const bad of ['', '..', '../evil', 'a/b', 'a\\b', '.hidden', 'UPPER', 'a.b', 'a'.repeat(42), '-lead']) {
      expect(storage.isProjectId(bad)).toBe(false);
    }
  });
});

describe('isSafeVariantId — filename safety', () => {
  it('accepts normal variant ids and rejects traversal', () => {
    for (const ok of ['v-abc', 'V1', 'variant_2', 'a']) expect(storage.isSafeVariantId(ok)).toBe(true);
    for (const bad of ['', '../../evil', 'a/b', 'a\\b', '.hidden', 'a'.repeat(65)]) {
      expect(storage.isSafeVariantId(bad)).toBe(false);
    }
  });

  it('saveVariant throws rather than writing a traversal path', async () => {
    const project = await storage.createProject('Guard');
    const scene = buildSampleHome();
    const evil = {
      meta: { schemaVersion: scene.schemaVersion, id: '../../../../pwned', projectId: project.id, name: 'x', styleTags: [], createdAt: new Date().toISOString() },
      scene,
    };
    await expect(storage.saveVariant(project.id, evil as never)).rejects.toThrow(/unsafe variant id/);
  });
});

describe('create / list / rename', () => {
  it('creates a project with meta and lists it alongside the sample built-in', async () => {
    const meta = await storage.createProject('Sharma Residence', 'apartment');
    expect(meta.id).toMatch(/^p-[a-z0-9]+$/);
    expect(meta.name).toBe('Sharma Residence');
    const list = await storage.listProjects();
    const ids = list.map((p) => p.id);
    expect(ids).toContain('sample-home');
    expect(ids).toContain(meta.id);
    const mine = list.find((p) => p.id === meta.id)!;
    expect(mine.kind).toBe('apartment');
    expect(mine.hasScene).toBe(false);
  });

  it('renames a project; blank names keep the old one', async () => {
    const meta = await storage.createProject('Old name');
    expect(await storage.renameProject(meta.id, 'New name')).toBe(true);
    expect((await storage.readProjectMeta(meta.id))?.name).toBe('New name');
    expect(await storage.renameProject(meta.id, '   ')).toBe(true);
    expect((await storage.readProjectMeta(meta.id))?.name).toBe('New name');
    expect(await storage.renameProject('p-nope00', 'X')).toBe(false);
  });

  it('defaults an empty create name to Untitled project', async () => {
    const meta = await storage.createProject('   ');
    expect(meta.name).toBe('Untitled project');
  });
});

describe('generic-project scenes + duplicate', () => {
  it('round-trips a scene for a created project and reports hasScene', async () => {
    const meta = await storage.createProject('Round Trip');
    expect(await storage.loadScene(meta.id)).toBeNull();
    const scene = { ...buildSampleHome(), id: meta.id, name: 'Round Trip' };
    await storage.saveScene(meta.id, scene);
    const loaded = await storage.loadScene(meta.id);
    expect(loaded?.name).toBe('Round Trip');
    const listed = (await storage.listProjects()).find((p) => p.id === meta.id)!;
    expect(listed.hasScene).toBe(true);
  });

  it('duplicates scene + variants into a fresh project', async () => {
    const src = await storage.createProject('Source');
    const scene = { ...buildSampleHome(), id: src.id, name: 'Source' };
    await storage.saveScene(src.id, scene);
    await storage.saveVariant(src.id, {
      meta: {
        schemaVersion: scene.schemaVersion,
        id: 'variant-x1',
        projectId: src.id,
        name: 'Option A',
        styleTags: [],
        createdAt: new Date().toISOString(),
      },
      scene,
    });

    const dup = await storage.duplicateProject(src.id, 'Copy of Source');
    expect(dup).not.toBeNull();
    const loaded = await storage.loadScene(dup!.id);
    expect(loaded?.name).toBe('Copy of Source');
    expect(loaded?.id).toBe(dup!.id);
    const variants = await storage.listVariants(dup!.id);
    expect(variants.map((v) => v.id)).toContain('variant-x1');
    // Copied variant is re-homed to the new project.
    expect(variants.find((v) => v.id === 'variant-x1')?.projectId).toBe(dup!.id);
    // Source untouched.
    expect((await storage.loadScene(src.id))?.name).toBe('Source');
  });

  it('duplicate of a scene-less project fails cleanly', async () => {
    const empty = await storage.createProject('Empty');
    expect(await storage.duplicateProject(empty.id, 'X')).toBeNull();
  });

  it('never lists directories that fail id validation or lack meta', async () => {
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(storage.APP_DATA, 'projects', 'no-meta-here'), { recursive: true });
    const list = await storage.listProjects();
    expect(list.map((p) => p.id)).not.toContain('no-meta-here');
    expect(existsSync(path.join(storage.APP_DATA, 'projects', 'no-meta-here'))).toBe(true);
  });
});
