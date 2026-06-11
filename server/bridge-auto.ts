/**
 * AUTO-trigger for the Claude bridge (opt-in design automation).
 *
 * When HOMECANVAS_BRIDGE_AUTO=1, a bridge request is answered automatically by
 * invoking the LOCAL `claude` CLI in print mode (`claude -p`) instead of waiting
 * for a human to run `bridge:pending`. The model proposes design edits as
 * ScenePatch ops; we force the correct requestId/contentHash and validate every
 * proposal before the app ever sees it.
 *
 * ⚠️ DISCLOSURE: this drives YOUR local Claude Code (your subscription). The
 * bridge was originally human-driven on purpose, because Anthropic's policy
 * reserves headless/automated use for API-key auth. This path is OFF by default
 * and you enable it explicitly. Nothing is uploaded by the app; the scene is
 * passed to your own local `claude` process.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BRIDGE_SCHEMA_VERSION,
  BridgeResponseSchema,
  type BridgeRequest,
  type BridgeResponse,
} from '../lib/agent/bridge-protocol';
import { readRequestAndScene, writeResponse } from './bridge';

export const bridgeAutoEnabled = (): boolean => process.env['HOMECANVAS_BRIDGE_AUTO'] === '1';

/** Pull the first balanced JSON object out of model output (handles ``` fences + prose). */
export function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type AutoParse =
  | { ok: true; response: BridgeResponse }
  | { ok: false; reason: string };

/**
 * Validate the model's output into a BridgeResponse. The requestId + contentHash
 * are forced from the request (the model can't get correlation wrong), and the
 * proposals must each be a valid BridgeProposal with a real ScenePatch.
 */
export function parseAutoResponse(modelText: string, request: BridgeRequest): AutoParse {
  const json = extractJson(modelText);
  if (!json || typeof json !== 'object') return { ok: false, reason: 'no JSON object in claude output' };
  const proposalsRaw = (json as { proposals?: unknown }).proposals;
  const note = (json as { note?: unknown }).note;
  const candidate = {
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    requestId: request.id,
    contentHash: request.contentHash,
    proposals: Array.isArray(proposalsRaw) ? proposalsRaw : [],
    ...(typeof note === 'string' ? { note } : {}),
  };
  const parsed = BridgeResponseSchema.safeParse(candidate);
  return parsed.success ? { ok: true, response: parsed.data } : { ok: false, reason: parsed.error.message };
}

/** Paste-ready prompt for `claude -p` — design ops over the scene, JSON only. */
export function buildAutoPrompt(request: BridgeRequest, sceneJson: string): string {
  return [
    `You are HomeCanvas's design engine. Propose interior-design edits for the request below as ScenePatch ops.`,
    ``,
    `USER REQUEST: ${request.message}`,
    request.selectedEntityId ? `SELECTED ENTITY: ${request.selectedEntityId}` : ``,
    ``,
    `Reply with ONLY a JSON object (no markdown, no prose) of this exact shape:`,
    `{"proposals":[{"id":"p1","summary":"...","target":"<room name>","patch":{"id":"patch-1","ops":[ <ops> ],"origin":"agent","description":"..."},"rationale":"...","confidence":0.8,"skippedLocked":[]}],"note":"optional"}`,
    ``,
    `Allowed ops (use ONLY ids that exist in the SCENE below — room ids, wall ids, material ids):`,
    `- {"type":"set_surface_color","surface":<SurfaceRef>,"color":"#rrggbb"}`,
    `- {"type":"assign_material_to_surface","surface":<SurfaceRef>,"materialId":"<scene.materials id>"}`,
    `- {"type":"set_room_style_tags","roomId":"<room id>","styleTags":["..."]}`,
    `SurfaceRef = {"kind":"roomFloor","roomId":"<id>"} | {"kind":"roomCeiling","roomId":"<id>"} | {"kind":"wallSide","wallId":"<id>","side":"sideA"|"sideB"}`,
    ``,
    `Keep it to a few coherent ops. Every proposal.patch.ops array must be non-empty. SCENE JSON:`,
    sceneJson,
  ]
    .filter((l) => l !== ``)
    .join('\n');
}

/** Locate the local `claude` binary (default install dir, else PATH). */
export function detectClaudeCli(): string {
  const candidates = [path.join(os.homedir(), '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const c of candidates) if (existsSync(c)) return c;
  return 'claude'; // fall back to PATH resolution; a missing binary surfaces as a spawn ENOENT
}

/** Run `claude -p` with the prompt on stdin. CLAUDECODE is unset so it works even when spawned from a Claude session. */
function runClaude(prompt: string, bin: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env['CLAUDECODE'];
    delete env['CLAUDE_CODE_ENTRYPOINT'];
    delete env['CLAUDE_CODE_SSE_PORT'];
    const child = spawn(bin, ['-p'], { env });
    let out = '';
    let err = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => finish(() => {
      child.kill('SIGKILL');
      reject(new Error('claude timed out'));
    }), timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    // If claude dies mid-write, stdin emits EPIPE — must be handled or it
    // throws as an uncaught exception and takes down the sidecar.
    child.stdin.on('error', () => {});
    child.on('error', (e) => finish(() => reject(e)));
    child.on('close', (code) => finish(() => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `claude exited with code ${code}`)))));
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch {
      /* stdin already closed — close/error handler reports the real reason */
    }
  });
}

const errorResponse = (request: BridgeRequest, note: string): BridgeResponse => ({
  schemaVersion: BRIDGE_SCHEMA_VERSION,
  requestId: request.id,
  contentHash: request.contentHash,
  proposals: [],
  note,
});

let inFlight = 0;
const MAX_INFLIGHT = 2; // cap concurrent `claude` processes — each is heavy + up to 180s

/**
 * Answer one bridge request automatically. TOTAL: always writes a response (with
 * a note on failure / busy) so the app's poll resolves instead of hanging, and
 * never rejects (so the `void autoAnswer(id)` call site can't crash the sidecar).
 * No-op unless auto mode is enabled.
 */
export async function autoAnswer(id: string): Promise<void> {
  if (!bridgeAutoEnabled()) return;
  const data = await readRequestAndScene(id);
  if (!data) return;

  let response: BridgeResponse;
  if (inFlight >= MAX_INFLIGHT) {
    response = errorResponse(data.request, 'Auto-bridge is busy (too many requests in flight) — retry in a moment.');
  } else {
    inFlight++;
    try {
      const out = await runClaude(buildAutoPrompt(data.request, data.sceneJson), detectClaudeCli());
      const parsed = parseAutoResponse(out, data.request);
      response = parsed.ok
        ? parsed.response
        : errorResponse(data.request, `Auto-bridge could not parse a valid design: ${parsed.reason}`);
    } catch (e) {
      response = errorResponse(data.request, `Auto-bridge error: ${(e as Error).message}`);
    } finally {
      inFlight--;
    }
  }

  try {
    await writeResponse(id, response);
  } catch (e) {
    console.error('autoAnswer: failed to write bridge response', e);
  }
}
