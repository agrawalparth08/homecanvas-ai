import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STYLE_PACKS } from '../lib/styles/style-packs';
import type * as PacksModule from './style-packs';

/** .hcpack import/export (server/style-packs.ts) — temp-dir + fresh-import pattern. */

const ORIGINAL_DATA_DIR = process.env.HOMECANVAS_DATA_DIR;

let tempDir: string;
let packs: typeof PacksModule;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hc-packs-'));
  process.env.HOMECANVAS_DATA_DIR = tempDir;
  vi.resetModules();
  packs = await import('./style-packs');
});

afterEach(async () => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.HOMECANVAS_DATA_DIR;
  else process.env.HOMECANVAS_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

describe('exportPack', () => {
  it('exports built-ins as hcpack envelopes; unknown ids are null', async () => {
    const envelope = await packs.exportPack(STYLE_PACKS[0]!.id);
    expect(envelope?.format).toBe('hcpack');
    expect(envelope?.pack.name).toBe(STYLE_PACKS[0]!.name);
    expect(await packs.exportPack('no-such-pack')).toBeNull();
  });
});

describe('importPack', () => {
  it('round-trips a built-in export into a custom pack with a fresh id', async () => {
    const envelope = await packs.exportPack(STYLE_PACKS[0]!.id);
    const result = await packs.importPack(envelope);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.id).not.toBe(STYLE_PACKS[0]!.id);
    expect(result.pack.id).toMatch(/^pack-/);
    expect(result.pack.name).toBe(STYLE_PACKS[0]!.name);

    const listed = await packs.listCustomPacks();
    expect(listed.map((p) => p.id)).toContain(result.pack.id);
    // findPack prefers the file, falls back to built-ins
    expect((await packs.findPack(result.pack.id))?.name).toBe(STYLE_PACKS[0]!.name);
    expect((await packs.findPack(STYLE_PACKS[1]!.id))?.id).toBe(STYLE_PACKS[1]!.id);
  });

  it('rejects garbage and invalid packs', async () => {
    expect((await packs.importPack({ nope: 1 })).ok).toBe(false);
    expect((await packs.importPack({ format: 'hcpack', version: 1, pack: { id: 'x' } })).ok).toBe(false);
    expect((await packs.importPack('string')).ok).toBe(false);
  });

  it('a hostile pack id in the file never becomes a filename', async () => {
    const envelope = await packs.exportPack(STYLE_PACKS[0]!.id);
    const hostile = { ...envelope!, pack: { ...envelope!.pack, id: '../../evil' } };
    const result = await packs.importPack(hostile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.id).toMatch(/^pack-/);
    expect(existsSync(path.join(tempDir, 'evil.json'))).toBe(false);
  });
});

describe('deleteCustomPack', () => {
  it('deletes customs, refuses built-ins and traversal', async () => {
    const imported = await packs.importPack(await packs.exportPack(STYLE_PACKS[0]!.id));
    if (!imported.ok) throw new Error('setup failed');
    expect(await packs.deleteCustomPack(imported.pack.id)).toBe(true);
    expect(await packs.listCustomPacks()).toHaveLength(0);
    expect(await packs.deleteCustomPack(STYLE_PACKS[0]!.id)).toBe(false);
    expect(await packs.deleteCustomPack('../../etc/passwd')).toBe(false);
  });
});
