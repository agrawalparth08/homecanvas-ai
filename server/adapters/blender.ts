/**
 * Headless Blender Cycles render adapter (the "quality ceiling", optional).
 *
 * Never bundles Blender — detects a user-installed binary, writes the scene to a
 * temp JSON, and runs `scripts/render-blender.py` to produce a PNG. Exec-only,
 * per-OS detection, graceful when Blender isn't installed. Pure candidate lists
 * are exported for tests.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

const execFileP = promisify(execFile);

/** Known Blender install locations per platform (pure → testable). */
export function blenderCandidates(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'darwin') return ['/Applications/Blender.app/Contents/MacOS/Blender'];
  if (platform === 'win32')
    return [
      'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
    ];
  return ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender'];
}

function onPath(bin: string): string | null {
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, bin);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Locate a Blender binary: env override → known install paths → PATH. */
export function detectBlender(): string | null {
  const override = process.env['HOMECANVAS_BLENDER_BIN'];
  if (override && existsSync(override)) return override;
  for (const c of blenderCandidates()) if (existsSync(c)) return c;
  return onPath(process.platform === 'win32' ? 'blender.exe' : 'blender');
}

export interface BlenderRenderOpts {
  samples?: number;
  /** 'WxH' */
  res?: string;
  /** Absolute path to an .hdr/.exr environment map (optional). */
  hdri?: string;
  gpu?: boolean;
  timeoutMs?: number;
}

export type BlenderRenderResult = { ok: true; pngPath: string } | { ok: false; reason: string };

// Env override lets the packaged Electron app point at the bundled script (and
// keeps the import.meta.dirname branch — empty in a CJS bundle — from running).
const RENDER_SCRIPT =
  process.env.HOMECANVAS_BLENDER_SCRIPT ??
  path.resolve(import.meta.dirname, '..', '..', 'scripts', 'render-blender.py');

/** Render a HomeScene to a PNG via headless Blender Cycles. Returns the file path. */
export async function renderWithBlender(scene: unknown, opts: BlenderRenderOpts = {}): Promise<BlenderRenderResult> {
  const bin = detectBlender();
  if (!bin) return { ok: false, reason: 'Blender not found — install Blender 4.5+ or set HOMECANVAS_BLENDER_BIN.' };
  if (!existsSync(RENDER_SCRIPT)) return { ok: false, reason: 'render-blender.py is missing.' };

  const dir = path.join(os.tmpdir(), 'homecanvas-blender');
  const stamp = `${process.pid}-${Date.now()}`;
  const scenePath = path.join(dir, `scene-${stamp}.json`);
  const outPath = path.join(dir, `render-${stamp}.png`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(scenePath, JSON.stringify(scene));
  } catch (e) {
    return { ok: false, reason: `Couldn't write temp files: ${(e as Error).message}` };
  }

  const args = [
    '-b',
    '-P',
    RENDER_SCRIPT,
    '--',
    '--scene',
    scenePath,
    '--out',
    outPath,
    '--samples',
    String(opts.samples ?? 128),
    '--res',
    opts.res ?? '1280x800',
  ];
  if (opts.hdri) args.push('--hdri', opts.hdri);
  if (opts.gpu) args.push('--gpu');

  try {
    const { stdout } = await execFileP(bin, args, {
      timeout: opts.timeoutMs ?? 8 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (!stdout.includes('HOMECANVAS_RENDER_OK') || !existsSync(outPath)) {
      return { ok: false, reason: 'Blender ran but produced no image (check the server log).' };
    }
    return { ok: true, pngPath: outPath };
  } catch (e) {
    return { ok: false, reason: (e as Error).message.slice(0, 300) };
  } finally {
    await unlink(scenePath).catch(() => {}); // the scene JSON is no longer needed
  }
}

/** Read a finished render off disk and delete it (read-once, for the sidecar to stream back). */
export async function readRender(pngPath: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(pngPath));
  await unlink(pngPath).catch(() => {}); // clean up the temp PNG after serving
  return bytes;
}
