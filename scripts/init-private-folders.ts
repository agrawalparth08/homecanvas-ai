/**
 * Create the gitignored /private-home-inputs/ tree where Parth's real home
 * files live. Safe to re-run any time (idempotent, never overwrites).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PRIVATE_DIRS } from '../lib/fixtures/private-home';

const ROOT = path.resolve(import.meta.dirname, '..', 'private-home-inputs');

const README = `# Private home inputs (gitignored — never committed, never uploaded)

Drop your real home files here:

raw/
  floor-plan-main.pdf / floor-plan-main.png   — your 2D floor plan(s)
  *.dwg / *.dxf                               — optional CAD files
  dimensions.pdf, electrical.pdf, ...         — optional ancillary PDFs
  reference-tiles/      — tile/material reference photos
  reference-furniture/  — furniture reference photos
  reference-colors/     — palettes, paint swatches
  reference-moodboards/ — moodboards
  site-photos/          — real photos of your (empty) rooms

processed/  — app-generated artifacts (rasterized pages, extracted geometry,
              scene JSON). The app writes here; you normally don't.
versions/   — saved design variants of your home.

Everything stays on this machine. Run \`npm run detect:private\` to see what
the app recognizes.
`;

async function main(): Promise<void> {
  for (const dir of PRIVATE_DIRS) {
    await mkdir(path.join(ROOT, dir), { recursive: true });
  }
  const readmePath = path.join(ROOT, 'README.md');
  if (!existsSync(readmePath)) await writeFile(readmePath, README);
  console.log(`private-home-inputs/ ready at ${ROOT}`);
  console.log('Drop your floor plan into private-home-inputs/raw/ and run: npm run detect:private');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
