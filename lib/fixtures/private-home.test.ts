import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectPrivateHomeFiles } from './private-home';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'homecanvas-private-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('private home file detection', () => {
  it('reports an empty manifest when nothing is present', async () => {
    const manifest = await detectPrivateHomeFiles(root);
    expect(manifest.files).toEqual([]);
    expect(manifest.hasFloorPlan).toBe(false);
    expect(manifest.hasManualScene).toBe(false);
  });

  it('classifies floor plans, CAD, site photos and references', async () => {
    await mkdir(path.join(root, 'raw/site-photos'), { recursive: true });
    await mkdir(path.join(root, 'raw/reference-tiles'), { recursive: true });
    await writeFile(path.join(root, 'raw/floor-plan-main.pdf'), 'pdf');
    await writeFile(path.join(root, 'raw/plan-tower-b.png'), 'png');
    await writeFile(path.join(root, 'raw/electrical.pdf'), 'pdf');
    await writeFile(path.join(root, 'raw/home.dwg'), 'dwg');
    await writeFile(path.join(root, 'raw/site-photos/living-east.jpg'), 'jpg');
    await writeFile(path.join(root, 'raw/reference-tiles/terrazzo.jpg'), 'jpg');

    const manifest = await detectPrivateHomeFiles(root);
    const roleOf = (name: string) => manifest.files.find((f) => f.fileName === name)?.role;

    expect(roleOf('floor-plan-main.pdf')).toBe('floorPlan');
    expect(roleOf('plan-tower-b.png')).toBe('floorPlan');
    expect(roleOf('electrical.pdf')).toBe('electrical');
    expect(roleOf('home.dwg')).toBe('cad');
    expect(roleOf('living-east.jpg')).toBe('sitePhoto');
    expect(roleOf('terrazzo.jpg')).toBe('referenceImage');

    expect(manifest.hasFloorPlan).toBe(true);
    expect(manifest.hasCad).toBe(true);
    expect(manifest.hasSitePhotos).toBe(true);
    expect(manifest.hasReferences).toBe(true);
  });

  it('detects manual and generated scene files', async () => {
    await mkdir(path.join(root, 'processed/scene-json'), { recursive: true });
    await writeFile(path.join(root, 'processed/scene-json/my-home.manual.scene.json'), '{}');
    const manifest = await detectPrivateHomeFiles(root);
    expect(manifest.hasManualScene).toBe(true);
    expect(manifest.hasGeneratedScene).toBe(false);
  });

  it('ignores dotfiles', async () => {
    await mkdir(path.join(root, 'raw'), { recursive: true });
    await writeFile(path.join(root, 'raw/.DS_Store'), 'junk');
    const manifest = await detectPrivateHomeFiles(root);
    expect(manifest.files).toEqual([]);
  });

  it('does not follow symlinks out of the private root', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'homecanvas-outside-'));
    await writeFile(path.join(outside, 'secret.txt'), 'private');
    await mkdir(path.join(root, 'raw'), { recursive: true });
    await writeFile(path.join(root, 'raw/plan.png'), 'png');
    try {
      await symlink(outside, path.join(root, 'raw/escape'), 'dir');
      await symlink(path.join(outside, 'secret.txt'), path.join(root, 'raw/leak.txt'));
    } catch {
      return; // symlink unsupported (e.g. restricted CI) — nothing to assert
    }
    const manifest = await detectPrivateHomeFiles(root);
    const names = manifest.files.map((f) => f.fileName);
    expect(names).toContain('plan.png');
    expect(names).not.toContain('secret.txt');
    expect(names).not.toContain('leak.txt');
    await rm(outside, { recursive: true, force: true });
  });

  it('does not crash on a dangling symlink', async () => {
    await mkdir(path.join(root, 'raw'), { recursive: true });
    await writeFile(path.join(root, 'raw/plan.png'), 'png');
    try {
      await symlink(path.join(root, 'raw/nonexistent-target'), path.join(root, 'raw/broken'));
    } catch {
      return;
    }
    const manifest = await detectPrivateHomeFiles(root);
    expect(manifest.files.map((f) => f.fileName)).toContain('plan.png');
  });
});
