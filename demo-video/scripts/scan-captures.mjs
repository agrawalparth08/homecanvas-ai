/**
 * Scan public/captures/ for real screen-grabs from the app and write a map of
 * slot -> path into src/captures.json, which the composition reads. Files are
 * matched by their basename (the "slot"), e.g.:
 *
 *   public/captures/walkthrough.mp4  -> { "walkthrough": "captures/walkthrough.mp4" }
 *   public/captures/photoreal.png    -> { "photoreal":   "captures/photoreal.png" }
 *
 * Recognised slots (any subset; the rest fall back to the synthetic scene):
 *   walkthrough | orbit | walk | tour | top | trace | edit   (video clips)
 *   photoreal   (a saved Photo Mode PNG)   photorealClip (convergence .mp4)
 *
 * public/captures/ is gitignored — your real footage never enters git. This
 * script also tries to keep src/captures.json out of your commits via
 * `git update-index --skip-worktree` so a populated map doesn't get pushed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const capDir = path.join(root, 'public', 'captures');
mkdirSync(capDir, { recursive: true });

const VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const map = {};
for (const f of readdirSync(capDir)) {
  const ext = path.extname(f).toLowerCase();
  if (!VIDEO.has(ext) && !IMAGE.has(ext)) continue;
  const slot = path.basename(f, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
  map[slot] = { src: `captures/${f}`, kind: VIDEO.has(ext) ? 'video' : 'image' };
}

const outPath = path.join(root, 'src', 'captures.json');
writeFileSync(outPath, JSON.stringify(map, null, 2) + '\n');

const slots = Object.keys(map);
console.log(slots.length ? `Found ${slots.length} capture(s): ${slots.join(', ')}` : 'No captures yet — the build will use the synthetic visuals.');

// Don't let a populated captures.json sneak into a commit/push.
if (slots.length && existsSync(path.join(root, '..', '.git'))) {
  try {
    execFileSync('git', ['update-index', '--skip-worktree', 'demo-video/src/captures.json'], { cwd: path.join(root, '..') });
  } catch {
    /* not fatal */
  }
}
