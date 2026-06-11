/**
 * DWG → DXF conversion via a user-installed, exec-only converter (Phase 3).
 * Never bundles a converter; detects ODA File Converter or LibreDWG `dwg2dxf`
 * per-OS and shells out. Absent → a graceful reason the UI can show.
 */
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type ConverterKind = 'oda' | 'libredwg';
export interface DwgConverter { kind: ConverterKind; path: string; }

/** Candidate converter binaries to probe, per platform (pure → testable). */
export function dwgConverterCandidates(platform: NodeJS.Platform = process.platform): DwgConverter[] {
  if (platform === 'darwin') {
    return [
      { kind: 'oda', path: '/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter' },
      { kind: 'libredwg', path: '/opt/homebrew/bin/dwg2dxf' },
      { kind: 'libredwg', path: '/usr/local/bin/dwg2dxf' },
    ];
  }
  if (platform === 'win32') {
    return [
      { kind: 'oda', path: 'C:\\Program Files\\ODA\\ODAFileConverter\\ODAFileConverter.exe' },
      { kind: 'oda', path: 'C:\\Program Files\\ODAFileConverter\\ODAFileConverter.exe' },
    ];
  }
  return [
    { kind: 'libredwg', path: '/usr/bin/dwg2dxf' },
    { kind: 'libredwg', path: '/usr/local/bin/dwg2dxf' },
  ];
}

function onPath(bin: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, bin);
    if (existsSync(p)) return p;
  }
  return null;
}

/** The first installed converter, or null. */
export function detectDwgConverter(): DwgConverter | null {
  for (const c of dwgConverterCandidates()) if (existsSync(c.path)) return c;
  const p = onPath(process.platform === 'win32' ? 'dwg2dxf.exe' : 'dwg2dxf');
  return p ? { kind: 'libredwg', path: p } : null;
}

export interface ConvertResult { ok: boolean; dxfPath?: string; reason?: string; }

export async function convertDwgToDxf(dwgPath: string, outDir: string): Promise<ConvertResult> {
  const conv = detectDwgConverter();
  if (!conv) return { ok: false, reason: 'No DWG→DXF converter found — install ODA File Converter or LibreDWG (dwg2dxf).' };
  const dxfPath = path.join(outDir, path.basename(dwgPath).replace(/\.dwg$/i, '.dxf'));
  try {
    if (conv.kind === 'libredwg') {
      await execFileP(conv.path, [dwgPath, '-o', dxfPath]);
    } else {
      // ODA CLI: <inDir> <outDir> <outVer> <outType> <recurse> <audit> <inputFilter>
      await execFileP(conv.path, [path.dirname(dwgPath), outDir, 'ACAD2018', 'DXF', '0', '1', path.basename(dwgPath)]);
    }
    return existsSync(dxfPath) ? { ok: true, dxfPath } : { ok: false, reason: 'Converter ran but produced no DXF.' };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
