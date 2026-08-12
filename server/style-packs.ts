import { existsSync } from 'node:fs';
import { readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { StylePackSchema, type StylePack } from '../lib/scene/schemas';
import { STYLE_PACKS } from '../lib/styles/style-packs';
import { APP_DATA, atomicWrite } from './storage';

/**
 * .hcpack style packs — the shareable unit of taste. A designer's custom pack
 * (palette + wall/floor/ceiling material specs + room overrides) exports as
 * one JSON file another designer can import; the built-ins export too, as
 * starting points. Custom packs live at APP_DATA/style-packs/<id>.json;
 * imports always re-mint the id, so a pack can never shadow a built-in or
 * clobber an existing custom pack.
 */

export const HCPACK_VERSION = 1;

export interface PackEnvelope {
  format: 'hcpack';
  version: number;
  exportedAt: string;
  pack: StylePack;
}

const EnvelopeSchema = z.object({
  format: z.literal('hcpack'),
  version: z.literal(HCPACK_VERSION),
  pack: z.unknown(),
});

// Filename-safety for custom pack files (mirrors ProjectId's rationale).
const PACK_FILE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

const packsDir = (): string => path.join(APP_DATA, 'style-packs');
const packPath = (id: string): string => path.join(packsDir(), `${id}.json`);

export async function listCustomPacks(): Promise<StylePack[]> {
  const dir = packsDir();
  if (!existsSync(dir)) return [];
  const out: StylePack[] = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const parsed = StylePackSchema.safeParse(JSON.parse(await readFile(path.join(dir, entry), 'utf8')));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // unreadable pack — skip, never crash the listing
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Custom pack or built-in, in that order (customs are listed first in UI). */
export async function findPack(id: string): Promise<StylePack | null> {
  if (PACK_FILE_ID.test(id) && existsSync(packPath(id))) {
    try {
      const parsed = StylePackSchema.safeParse(JSON.parse(await readFile(packPath(id), 'utf8')));
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to built-ins
    }
  }
  return STYLE_PACKS.find((p) => p.id === id) ?? null;
}

export async function exportPack(id: string): Promise<PackEnvelope | null> {
  const pack = await findPack(id);
  if (!pack) return null;
  return { format: 'hcpack', version: HCPACK_VERSION, exportedAt: new Date().toISOString(), pack };
}

export type PackImportResult = { ok: true; pack: StylePack } | { ok: false; reason: string };

export async function importPack(raw: unknown): Promise<PackImportResult> {
  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { ok: false, reason: 'Not a HomeCanvas style pack (.hcpack) — or a newer format than this app understands.' };
  }
  const parsed = StylePackSchema.safeParse(envelope.data.pack);
  if (!parsed.success) {
    return { ok: false, reason: `The pack failed validation: ${parsed.error.issues[0]?.message ?? 'invalid pack'}` };
  }
  // Fresh id every import: never shadows a built-in, never overwrites.
  const pack: StylePack = {
    ...parsed.data,
    id: `pack-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`,
  };
  await atomicWrite(packPath(pack.id), JSON.stringify(pack, null, 2));
  return { ok: true, pack };
}

/** Delete a CUSTOM pack. Built-ins aren't files and can't be deleted. */
export async function deleteCustomPack(id: string): Promise<boolean> {
  if (!PACK_FILE_ID.test(id) || !existsSync(packPath(id))) return false;
  await unlink(packPath(id));
  return true;
}
