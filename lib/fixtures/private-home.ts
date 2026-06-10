import { existsSync } from 'node:fs';
import { lstat, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  SCHEMA_VERSION,
  type PrivateHomeFileManifest,
  type UploadedFile,
} from '../scene/schemas';

/**
 * Private "my home" fixture detection. Scans /private-home-inputs/raw/ and
 * classifies what Parth has dropped in. Server-side only (node:fs) —
 * the SPA reads the result via GET /api/private-home/manifest.
 * Nothing in here ever uploads or transmits; it only reads the local disk.
 */

export const PRIVATE_DIRS = [
  'raw',
  'raw/reference-tiles',
  'raw/reference-furniture',
  'raw/reference-colors',
  'raw/reference-moodboards',
  'raw/site-photos',
  'processed/rasterized-pages',
  'processed/extracted-text',
  'processed/extracted-cad',
  'processed/detected-geometry',
  'processed/scene-json',
  'processed/generated-previews',
  'versions',
] as const;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
const CAD_EXT = new Set(['.dwg', '.dxf']);

type Role = UploadedFile['role'];

function classify(relPath: string): Role {
  const lower = relPath.toLowerCase();
  const ext = path.extname(lower);
  const base = path.basename(lower);

  if (CAD_EXT.has(ext)) return 'cad';
  if (lower.includes('site-photo')) return 'sitePhoto';
  if (
    lower.includes('reference-tiles') ||
    lower.includes('reference-furniture') ||
    lower.includes('reference-colors') ||
    lower.includes('reference-moodboards')
  ) {
    return 'referenceImage';
  }

  const hints: [string, Role][] = [
    ['floor-plan', 'floorPlan'],
    ['floorplan', 'floorPlan'],
    ['plan', 'floorPlan'],
    ['elevation', 'elevation'],
    ['section', 'section'],
    ['dimension', 'dimensions'],
    ['electrical', 'electrical'],
    ['electric', 'electrical'],
    ['furniture', 'furnitureLayout'],
    ['material', 'materialSpec'],
    ['spec', 'materialSpec'],
  ];
  for (const [hint, role] of hints) {
    if (base.includes(hint)) return role;
  }

  if (ext === '.pdf') return 'builderDoc';
  if (IMAGE_EXT.has(ext)) return 'referenceImage';
  return 'unknown';
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    let info;
    try {
      info = await lstat(full); // lstat, not stat: never follow symlinks out of the private root
    } catch {
      continue; // dangling link / race — skip, never crash the scan
    }
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) await walk(full, root, out);
    else if (info.isFile()) out.push(path.relative(root, full));
  }
}

export async function detectPrivateHomeFiles(rootDir: string): Promise<PrivateHomeFileManifest> {
  const rawDir = path.join(rootDir, 'raw');
  const relFiles: string[] = [];
  await walk(rawDir, rootDir, relFiles);

  const files: UploadedFile[] = [];
  for (const rel of relFiles.sort()) {
    const full = path.join(rootDir, rel);
    let info;
    try {
      info = await stat(full);
    } catch {
      continue; // removed between walk and stat — skip rather than 500 the endpoint
    }
    const ext = path.extname(rel).toLowerCase();
    files.push({
      id: rel.replace(/[^a-zA-Z0-9]+/g, '-'),
      fileName: path.basename(rel),
      filePath: rel,
      mimeType:
        ext === '.pdf'
          ? 'application/pdf'
          : IMAGE_EXT.has(ext)
            ? `image/${ext.slice(1) === 'jpg' ? 'jpeg' : ext.slice(1)}`
            : 'application/octet-stream',
      bytes: info.size,
      role: classify(rel),
      addedAt: info.mtime.toISOString(),
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    scannedAt: new Date().toISOString(),
    rootDir,
    files,
    hasFloorPlan: files.some((f) => f.role === 'floorPlan'),
    hasCad: files.some((f) => f.role === 'cad'),
    hasSitePhotos: files.some((f) => f.role === 'sitePhoto'),
    hasReferences: files.some((f) => f.role === 'referenceImage'),
    hasManualScene: existsSync(path.join(rootDir, 'processed/scene-json/my-home.manual.scene.json')),
    hasGeneratedScene: existsSync(path.join(rootDir, 'processed/scene-json/my-home.scene.json')),
  };
}
