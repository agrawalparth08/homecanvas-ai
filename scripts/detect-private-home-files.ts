/**
 * Scan /private-home-inputs/raw/ and report (and persist) what the app
 * recognizes. Output: private-home-inputs/processed/manifest.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { detectPrivateHomeFiles } from '../lib/fixtures/private-home';

const ROOT = path.resolve(import.meta.dirname, '..', 'private-home-inputs');

async function main(): Promise<void> {
  const manifest = await detectPrivateHomeFiles(ROOT);
  await mkdir(path.join(ROOT, 'processed'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'processed', 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`Scanned ${manifest.rootDir}`);
  if (manifest.files.length === 0) {
    console.log('No files found. Run `npm run init:private` and drop files into private-home-inputs/raw/.');
    return;
  }
  for (const f of manifest.files) {
    console.log(`  [${f.role.padEnd(15)}] ${f.filePath} (${(f.bytes / 1024).toFixed(0)} KB)`);
  }
  console.log(
    `floorPlan=${manifest.hasFloorPlan} cad=${manifest.hasCad} sitePhotos=${manifest.hasSitePhotos} references=${manifest.hasReferences}`,
  );
  console.log(`manualScene=${manifest.hasManualScene} generatedScene=${manifest.hasGeneratedScene}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
