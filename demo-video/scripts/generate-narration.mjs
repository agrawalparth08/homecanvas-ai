/**
 * Generate narration audio + scene durations.
 *
 * Preferred: ElevenLabs (expressive human voice). Set ELEVENLABS_API_KEY in the
 * environment — the key is NEVER stored in this repo. Voice defaults to
 * "Aashish — Natural Indian male" (warm Indian-English, handles Hinglish words
 * like "Rajasthani" natively); override with DEMO_VOICE_ID.
 *
 * Fallback (no key): macOS built-in `say` (Samantha).
 *
 * Output is always public/narration/<id>.wav (44.1k LEI16 via afconvert) so the
 * composition never cares which engine produced it. Durations land in
 * src/durations.json and drive each scene's length.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const narration = JSON.parse(readFileSync(path.join(root, 'src', 'narration.json'), 'utf8'));

const XI_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.DEMO_VOICE_ID ?? 'RpiHVNPKGBg7UmgmrKrN'; // Aashish — Natural Indian male
const SAY_VOICE = process.env.DEMO_VOICE ?? 'Samantha';

/** Spoken variants where the literal caption would be mispronounced. */
const TTS_OVERRIDES = {
  outro: (caption) => caption.replace('agrawalparth08@gmail.com', 'agrawal parth zero eight, at gmail dot com'),
};

const outDir = path.join(root, 'public', 'narration');
mkdirSync(outDir, { recursive: true });

async function elevenlabs(text, mp3Path) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': XI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      // lower stability + some style = more energetic, expressive delivery
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  writeFileSync(mp3Path, Buffer.from(await res.arrayBuffer()));
}

const durations = {};
for (const [id, caption] of Object.entries(narration)) {
  const text = TTS_OVERRIDES[id] ? TTS_OVERRIDES[id](caption) : caption;
  const wav = path.join(outDir, `${id}.wav`);
  const tmp = path.join(outDir, `${id}.${XI_KEY ? 'mp3' : 'aiff'}`);
  if (XI_KEY) {
    await elevenlabs(text, tmp);
  } else {
    execFileSync('say', ['-v', SAY_VOICE, '-r', '178', '-o', tmp, text]);
  }
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', tmp, wav]);
  rmSync(tmp);
  const info = execFileSync('afinfo', [wav], { encoding: 'utf8' });
  const m = info.match(/estimated duration: ([\d.]+) sec/);
  if (!m) throw new Error(`afinfo gave no duration for ${id}`);
  durations[id] = Number(m[1]);
  console.log(`${id.padEnd(10)} ${durations[id].toFixed(2)}s  [${XI_KEY ? 'elevenlabs' : 'say'}]  "${text.slice(0, 56)}${text.length > 56 ? '…' : ''}"`);
}

writeFileSync(path.join(root, 'src', 'durations.json'), JSON.stringify(durations, null, 2) + '\n');
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`\nTotal narration: ${total.toFixed(1)}s → video ≈ ${(total + Object.keys(durations).length * 1.13).toFixed(0)}s`);
