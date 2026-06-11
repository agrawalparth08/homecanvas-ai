/**
 * Download the curated CC0 asset set (Poly Haven) into /asset-cache/.
 *
 * Usage: npm run fetch:assets
 *
 * - All assets are CC0 (no attribution required, commercial use OK).
 * - Downloads only; nothing is ever uploaded.
 * - Per-asset failures are non-fatal: the app falls back to flat colors.
 * - Poly Haven API ToS asks for a descriptive User-Agent.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CURATED_FURNITURE,
  CURATED_HDRIS,
  CURATED_TEXTURES,
  type AssetCacheManifest,
  type DownloadedTextureSet,
} from '../lib/assets/manifest';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'asset-cache');
const UA = 'HomeCanvasAI/0.1 (local-first personal interior design tool)';

async function api(slug: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://api.polyhaven.com/files/${slug}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Poly Haven model file node: gltf = { '1k': { gltf: { url, include: {rel: {url}} } } }.
 * Returns the entry-file url + its include map (the .bin + textures the glTF
 * references by relative path).
 */
function gltfNode(node: unknown, resolution: string): { url: string; include: Record<string, string> } | null {
  if (typeof node !== 'object' || node === null) return null;
  const res = (node as Record<string, unknown>)[resolution];
  if (typeof res !== 'object' || res === null) return null;
  const g = (res as Record<string, unknown>)['gltf'];
  if (typeof g !== 'object' || g === null) return null;
  const url = (g as Record<string, unknown>)['url'];
  if (typeof url !== 'string') return null;
  const include: Record<string, string> = {};
  const inc = (g as Record<string, unknown>)['include'];
  if (typeof inc === 'object' && inc !== null) {
    for (const [rel, file] of Object.entries(inc as Record<string, unknown>)) {
      const u = typeof file === 'object' && file !== null ? (file as Record<string, unknown>)['url'] : null;
      if (typeof u === 'string') include[rel] = u;
    }
  }
  return { url, include };
}

/** Walk file-info nodes like { '1k': { jpg: { url, size } } }. */
function pickUrl(node: unknown, resolution: string, ext: string): string | null {
  if (typeof node !== 'object' || node === null) return null;
  const res = (node as Record<string, unknown>)[resolution];
  if (typeof res !== 'object' || res === null) return null;
  const file = (res as Record<string, unknown>)[ext];
  if (typeof file !== 'object' || file === null) return null;
  const url = (file as Record<string, unknown>)['url'];
  return typeof url === 'string' ? url : null;
}

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`HomeCanvas asset fetcher → ${CACHE}`);
  await mkdir(CACHE, { recursive: true });

  const manifest: AssetCacheManifest = {
    schemaVersion: 1,
    downloadedAt: new Date().toISOString(),
    hdris: {},
    textures: {},
    models: {},
  };

  for (const hdri of CURATED_HDRIS) {
    const info = await api(hdri.slug);
    const url = info ? pickUrl(info['hdri'], hdri.resolution, 'hdr') : null;
    if (!url) {
      console.warn(`  ✗ hdri ${hdri.key} (${hdri.slug}): not found on Poly Haven`);
      continue;
    }
    const rel = path.join('hdris', `${hdri.key}.hdr`);
    if (await download(url, path.join(CACHE, rel))) {
      manifest.hdris[hdri.key] = { file: rel, slug: hdri.slug };
      console.log(`  ✓ hdri ${hdri.key} (${hdri.slug})`);
    } else {
      console.warn(`  ✗ hdri ${hdri.key}: download failed`);
    }
  }

  const MAP_KEYS: [keyof DownloadedTextureSet['maps'], string[]][] = [
    ['diffuse', ['Diffuse', 'diff', 'diffuse']],
    ['normal', ['nor_gl', 'normal', 'Normal']],
    ['roughness', ['Rough', 'rough', 'roughness']],
    ['arm', ['arm', 'ARM']],
  ];

  for (const tex of CURATED_TEXTURES) {
    const info = await api(tex.slug);
    if (!info) {
      console.warn(`  ✗ texture ${tex.key} (${tex.slug}): not found on Poly Haven`);
      continue;
    }
    const set: DownloadedTextureSet = {
      key: tex.key,
      slug: tex.slug,
      maps: {},
    };
    for (const [mapName, apiKeys] of MAP_KEYS) {
      for (const apiKey of apiKeys) {
        const url = pickUrl(info[apiKey], '1k', 'jpg');
        if (url) {
          const rel = path.join('textures', tex.key, `${mapName}.jpg`);
          if (await download(url, path.join(CACHE, rel))) set.maps[mapName] = rel;
          break;
        }
      }
    }
    if (set.maps.diffuse) {
      manifest.textures[tex.key] = set;
      console.log(`  ✓ texture ${tex.key} (${tex.slug}) [${Object.keys(set.maps).join(', ')}]`);
    } else {
      console.warn(`  ✗ texture ${tex.key} (${tex.slug}): no diffuse map resolved`);
    }
  }

  // --- CC0 furniture glTF (multi-file: entry .gltf + .bin + textures) --------
  for (const model of CURATED_FURNITURE) {
    const info = await api(model.slug);
    const node = info ? gltfNode(info['gltf'], model.resolution) : null;
    if (!node) {
      console.warn(`  ✗ model ${model.key} (${model.slug}): no gltf at ${model.resolution}`);
      continue;
    }
    const dir = path.join('models', model.key);
    if (!(await download(node.url, path.join(CACHE, dir, 'model.gltf')))) {
      console.warn(`  ✗ model ${model.key}: entry .gltf download failed`);
      continue;
    }
    // include files keep their relative paths so the glTF's uris resolve.
    let parts = 0;
    for (const [rel, url] of Object.entries(node.include)) {
      if (await download(url, path.join(CACHE, dir, rel))) parts++;
    }
    manifest.models[model.key] = { key: model.key, slug: model.slug, file: path.join(dir, 'model.gltf') };
    console.log(`  ✓ model ${model.key} (${model.slug}) [+${parts} files]`);
  }

  await writeFile(path.join(CACHE, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const nT = Object.keys(manifest.textures).length;
  const nH = Object.keys(manifest.hdris).length;
  const nM = Object.keys(manifest.models).length;
  console.log(`Done: ${nH}/${CURATED_HDRIS.length} HDRIs, ${nT}/${CURATED_TEXTURES.length} textures, ${nM}/${CURATED_FURNITURE.length} models.`);
  console.log('Missing sets are fine — materials fall back to flat colors, furniture to procedural meshes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
