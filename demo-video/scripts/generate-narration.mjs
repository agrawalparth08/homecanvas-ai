/**
 * Generate narration audio with macOS's built-in TTS (zero paid APIs):
 *   say (AIFF) → afconvert (WAV 44.1k) → afinfo (duration) → src/durations.json
 *
 * Caption text lives in src/narration.json. TTS_OVERRIDES lets the spoken text
 * differ from the on-screen caption where the voice mangles a literal (e.g.
 * "npm" reads better spelled out).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const narration = JSON.parse(readFileSync(path.join(root, 'src', 'narration.json'), 'utf8'));

const VOICE = process.env.DEMO_VOICE ?? 'Samantha';
const RATE = process.env.DEMO_RATE ?? '178';

/** Spoken variants where the literal caption would be mispronounced. */
const TTS_OVERRIDES = {
  outro: 'HomeCanvas AI. Clone it, type N P M run dev, and meet your future home.',
};

const outDir = path.join(root, 'public', 'narration');
mkdirSync(outDir, { recursive: true });

const durations = {};
for (const [id, caption] of Object.entries(narration)) {
  const text = TTS_OVERRIDES[id] ?? caption;
  const aiff = path.join(outDir, `${id}.aiff`);
  const wav = path.join(outDir, `${id}.wav`);
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', aiff, wav]);
  rmSync(aiff);
  const info = execFileSync('afinfo', [wav], { encoding: 'utf8' });
  const m = info.match(/estimated duration: ([\d.]+) sec/);
  if (!m) throw new Error(`afinfo gave no duration for ${id}`);
  durations[id] = Number(m[1]);
  console.log(`${id.padEnd(10)} ${durations[id].toFixed(2)}s  "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
}

writeFileSync(path.join(root, 'src', 'durations.json'), JSON.stringify(durations, null, 2) + '\n');
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`\nTotal narration: ${total.toFixed(1)}s → video ≈ ${(total + Object.keys(durations).length * 1.13).toFixed(0)}s`);
