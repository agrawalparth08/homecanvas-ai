import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSampleHome } from '../lib/fixtures/sample-home';
import type { HomeScene } from '../lib/scene/schemas';
import type * as StorageModule from './storage';

/**
 * Covers the my-home canonical-file unification + auto-backup behavior in
 * server/storage.ts (BATCH G). storage.ts reads HOMECANVAS_DATA_DIR at
 * module-load time, so every test points that env var at a throwaway temp
 * directory and re-imports the module fresh — the real private-home-inputs/
 * is never touched.
 */

const ORIGINAL_DATA_DIR = process.env.HOMECANVAS_DATA_DIR;

let tempDir: string;
// Re-imported fresh per test (after HOMECANVAS_DATA_DIR is repointed + vi.resetModules()),
// so its module-level PRIVATE_ROOT/APP_DATA constants pick up the new temp dir.
let storage: typeof StorageModule;

async function freshStorage() {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hc-storage-myhome-'));
  process.env.HOMECANVAS_DATA_DIR = tempDir;
  vi.resetModules();
  storage = await import('./storage');
  return storage;
}

beforeEach(async () => {
  await freshStorage();
});

afterEach(async () => {
  vi.useRealTimers();
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.HOMECANVAS_DATA_DIR;
  else process.env.HOMECANVAS_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

function makeScene(name: string): HomeScene {
  return { ...buildSampleHome(), name };
}

async function backupFiles(): Promise<string[]> {
  const dir = path.join(storage.PRIVATE_ROOT, 'backups', 'auto');
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).sort();
}

describe('loadScene(my-home) — canonical file preferred', () => {
  it('reads my-home.scene.json when both the canonical and manual sidecar exist', async () => {
    await storage.saveScene('my-home', makeScene('canonical-version'));
    // Simulate a stale manual sidecar left over from before unification —
    // write it directly rather than through saveManualScene, which would
    // also update the canonical file.
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.dirname(storage.manualScenePath()), { recursive: true });
    await fs.writeFile(storage.manualScenePath(), JSON.stringify(makeScene('stale-manual-version'), null, 2));

    const loaded = await storage.loadScene('my-home');
    expect(loaded?.name).toBe('canonical-version');
  });

  it('falls back to the manual sidecar when scene.json is absent (legacy scenes)', async () => {
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.dirname(storage.manualScenePath()), { recursive: true });
    await fs.writeFile(storage.manualScenePath(), JSON.stringify(makeScene('legacy-manual-only'), null, 2));

    const loaded = await storage.loadScene('my-home');
    expect(loaded?.name).toBe('legacy-manual-only');
  });

  it('returns null when neither file exists', async () => {
    expect(await storage.loadScene('my-home')).toBeNull();
  });
});

describe('saveManualScene — unified write', () => {
  it('writes identical content to both the sidecar and the canonical file', async () => {
    const scene = makeScene('wizard-save');
    await storage.saveManualScene(scene);

    const canonicalPath = path.join(storage.PRIVATE_ROOT, 'processed', 'scene-json', 'my-home.scene.json');
    const canonicalRaw = await readFile(canonicalPath, 'utf8');
    const manualRaw = await readFile(storage.manualScenePath(), 'utf8');
    expect(canonicalRaw).toBe(manualRaw);
    expect(JSON.parse(canonicalRaw).name).toBe('wizard-save');
  });

  it('a subsequent loadScene sees the wizard save without going through the sidecar fallback', async () => {
    await storage.saveManualScene(makeScene('round-trip'));
    const loaded = await storage.loadScene('my-home');
    expect(loaded?.name).toBe('round-trip');
  });
});

describe('auto-backup on canonical overwrite', () => {
  it('does not back up the first save (nothing on disk yet to preserve)', async () => {
    await storage.saveScene('my-home', makeScene('first-ever-save'));
    expect(await backupFiles()).toEqual([]);
  });

  it('backs up the previous content before an overwrite that actually changes it', async () => {
    await storage.saveScene('my-home', makeScene('v1'));
    await storage.saveScene('my-home', makeScene('v2'));

    const files = await backupFiles();
    expect(files).toHaveLength(1);
    const backedUp = JSON.parse(
      await readFile(path.join(storage.PRIVATE_ROOT, 'backups', 'auto', files[0]!), 'utf8'),
    );
    expect(backedUp.name).toBe('v1'); // the content that got overwritten, not the new content
  });

  it('skips the backup when the new content is byte-identical to what is on disk', async () => {
    const scene = makeScene('unchanged');
    await storage.saveScene('my-home', scene);
    await storage.saveScene('my-home', scene); // identical save
    expect(await backupFiles()).toEqual([]);
  });

  it('saveManualScene also triggers a canonical backup before it overwrites scene.json', async () => {
    await storage.saveScene('my-home', makeScene('generated-trace'));
    await storage.saveManualScene(makeScene('wizard-edit'));

    const files = await backupFiles();
    expect(files).toHaveLength(1);
    const backedUp = JSON.parse(
      await readFile(path.join(storage.PRIVATE_ROOT, 'backups', 'auto', files[0]!), 'utf8'),
    );
    expect(backedUp.name).toBe('generated-trace');
  });

  it('prunes to the newest 20 backups', async () => {
    vi.useFakeTimers();
    const base = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(base);

    await storage.saveScene('my-home', makeScene('v0')); // no backup (first write)
    for (let i = 1; i <= 25; i++) {
      vi.setSystemTime(base + i * 1000); // distinct, monotonically increasing timestamps
      await storage.saveScene('my-home', makeScene(`v${i}`));
    }
    // 25 overwrites after the first save => 25 backups, pruned down to 20.
    const files = await backupFiles();
    expect(files).toHaveLength(20);

    // The retained backups are the 20 newest: content v5..v24 (v0..v4 pruned),
    // since each backup snapshots the content that was just overwritten.
    const contents = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(path.join(storage.PRIVATE_ROOT, 'backups', 'auto', f), 'utf8')).name),
    );
    expect(contents.sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `v${i + 5}`).sort(),
    );
  });
});

describe('loadScene(my-home) — one-time promotion of a newer manual sidecar', () => {
  it('promotes the sidecar into the canonical file (with a backup) when the sidecar is strictly newer', async () => {
    const fs = await import('node:fs/promises');
    // Pre-unification install: canonical written long ago, sidecar hand-tuned later.
    await storage.saveScene('my-home', makeScene('old-canonical'));
    await storage.atomicWrite(storage.manualScenePath(), JSON.stringify(makeScene('hand-tuned'), null, 2));
    // Make the sidecar decisively newer than the canonical (clears the 1s slack).
    const future = new Date(Date.now() + 10_000);
    await fs.utimes(storage.manualScenePath(), future, future);

    const loaded = await storage.loadScene('my-home');
    expect(loaded?.name).toBe('hand-tuned');

    // The canonical file now holds the promoted content…
    const canonical = JSON.parse(
      await readFile(path.join(storage.PRIVATE_ROOT, 'processed', 'scene-json', 'my-home.scene.json'), 'utf8'),
    ) as HomeScene;
    expect(canonical.name).toBe('hand-tuned');
    // …and the displaced canonical was backed up first, never silently lost.
    const backups = await backupFiles();
    expect(backups).toHaveLength(1);
    const backedUp = JSON.parse(
      await readFile(path.join(storage.PRIVATE_ROOT, 'backups', 'auto', backups[0]!), 'utf8'),
    ) as HomeScene;
    expect(backedUp.name).toBe('old-canonical');
  });

  it('does NOT promote when mtimes are within the same-save jitter window', async () => {
    await storage.saveScene('my-home', makeScene('canonical'));
    await storage.atomicWrite(storage.manualScenePath(), JSON.stringify(makeScene('sidecar-same-save'), null, 2));
    // Written back-to-back (< 1s apart) → treated as one unified save, no promotion.
    const loaded = await storage.loadScene('my-home');
    expect(loaded?.name).toBe('canonical');
    expect(await backupFiles()).toHaveLength(0);
  });
});
