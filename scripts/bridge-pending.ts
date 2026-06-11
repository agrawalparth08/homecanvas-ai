/**
 * bridge:pending — the human side of the Claude Code bridge.
 *
 *   npm run bridge:pending
 *       List every queued request and print a paste-ready prompt (scene + ask)
 *       for a local Claude Code session.
 *
 *   npm run bridge:pending -- respond <id> <response.json>
 *       Validate a proposal file and drop it as <id>.response.json + <id>.done
 *       (the .done marker is written LAST so the app reads a complete response).
 *
 * Nothing here is automated against any account — a person drives it. The app
 * only reads the response after the .done marker appears.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BRIDGE_DIR, bridgeEnabled, listPending } from '../server/bridge';
import { atomicWrite } from '../server/storage';
import {
  BridgeRequestSchema,
  BridgeResponseSchema,
  buildBridgePrompt,
  doneFile,
  responseFile,
  sceneFile,
} from '../lib/agent/bridge-protocol';

async function listAndPrint(): Promise<void> {
  if (!bridgeEnabled()) {
    console.log('Bridge is OFF. Start the sidecar with HOMECANVAS_ENABLE_BRIDGE=1 to use it.');
    return;
  }
  const pending = await listPending(Date.now());
  if (pending.length === 0) {
    console.log('No pending bridge requests.');
    return;
  }
  console.log(`${pending.length} pending request(s):\n`);
  for (const { id } of pending) {
    const req = BridgeRequestSchema.parse(JSON.parse(await readFile(path.join(BRIDGE_DIR, `${id}.request.json`), 'utf8')));
    const sceneJson = await readFile(path.join(BRIDGE_DIR, sceneFile(id)), 'utf8');
    console.log('='.repeat(72));
    console.log(buildBridgePrompt(req, sceneJson));
    console.log('='.repeat(72));
    console.log(`\nWhen done: npm run bridge:pending -- respond ${id} <your-response.json>\n`);
  }
}

async function respond(id: string, file: string): Promise<void> {
  if (!existsSync(file)) {
    console.error(`Response file not found: ${file}`);
    process.exitCode = 1;
    return;
  }
  const parsed = BridgeResponseSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success) {
    console.error('Response failed validation:\n' + parsed.error.message);
    process.exitCode = 1;
    return;
  }
  if (parsed.data.requestId !== id) {
    console.error(`requestId mismatch: file says "${parsed.data.requestId}", expected "${id}"`);
    process.exitCode = 1;
    return;
  }
  // response first, marker LAST.
  await atomicWrite(path.join(BRIDGE_DIR, responseFile(id)), JSON.stringify(parsed.data, null, 2));
  await atomicWrite(path.join(BRIDGE_DIR, doneFile(id)), '');
  console.log(`Wrote ${responseFile(id)} + ${doneFile(id)}. The app will pick it up on its next poll.`);
}

async function main(): Promise<void> {
  const [cmd, id, file] = process.argv.slice(2);
  if (cmd === 'respond') {
    if (!id || !file) {
      console.error('Usage: npm run bridge:pending -- respond <id> <response.json>');
      process.exitCode = 1;
    } else {
      await respond(id, file);
    }
  } else {
    await listAndPrint();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
