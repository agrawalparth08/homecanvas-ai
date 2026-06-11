/**
 * Sidecar side of the Claude Code bridge (Phase 4). Owns the file exchange under
 * private-home-inputs/bridge/. Off unless HOMECANVAS_ENABLE_BRIDGE=1.
 *
 * Flow:
 *   app  -> writeRequest()  -> <id>.request.json + <id>.scene.json   (atomic)
 *   human Claude session reads them, writes <id>.response.json, then
 *   creates empty <id>.done LAST.
 *   app  -> readResult(id)  -> only reads the response once .done exists.
 *
 * Everything is validated against bridge-protocol schemas; stale requests are
 * swept on every access (TTL). Pure protocol lives in lib/agent/bridge-protocol.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { HomeScene } from '../lib/scene/schemas';
import {
  BRIDGE_SCHEMA_VERSION,
  BridgeRequestSchema,
  BridgeResponseSchema,
  type BridgeProposal,
  type BridgeRequest,
  type BridgeResponse,
  doneFile,
  hashString,
  isExpired,
  isValidBridgeId,
  requestFile,
  responseFile,
  sceneFile,
} from '../lib/agent/bridge-protocol';
import { PRIVATE_ROOT, atomicWrite } from './storage';

export const BRIDGE_DIR = path.join(PRIVATE_ROOT, 'bridge');

export const bridgeEnabled = (): boolean => process.env['HOMECANVAS_ENABLE_BRIDGE'] === '1';

const p = (name: string) => path.join(BRIDGE_DIR, name);

/** Remove the whole fileset for one request id. */
async function purge(id: string): Promise<void> {
  await Promise.all(
    [requestFile(id), sceneFile(id), responseFile(id), doneFile(id)].map((f) => rm(p(f), { force: true })),
  );
}

/** Drop expired requests so the dir never accumulates abandoned snapshots. */
export async function sweepStale(now: number): Promise<void> {
  if (!existsSync(BRIDGE_DIR)) return;
  const files = await readdir(BRIDGE_DIR);
  for (const f of files) {
    if (!f.endsWith('.request.json')) continue;
    const id = f.replace('.request.json', '');
    try {
      const req = BridgeRequestSchema.parse(JSON.parse(await readFile(p(f), 'utf8')));
      if (isExpired(req, now)) await purge(id);
    } catch {
      await purge(id); // unparseable request -> drop its fileset
    }
  }
}

export interface WriteRequestResult {
  id: string;
  contentHash: string;
}

/** Snapshot the scene + write the request atomically. Returns the new id. */
export async function writeRequest(input: {
  message: string;
  scene: HomeScene;
  selectedEntityId?: string;
  now: number;
}): Promise<WriteRequestResult> {
  await sweepStale(input.now);
  const id = randomUUID();
  const sceneJson = JSON.stringify(input.scene);
  const contentHash = hashString(sceneJson);
  const req: BridgeRequest = {
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    id,
    createdAt: input.now,
    message: input.message,
    contentHash,
    ...(input.selectedEntityId ? { selectedEntityId: input.selectedEntityId } : {}),
  };
  // scene first, then the request that references it.
  await atomicWrite(p(sceneFile(id)), sceneJson);
  await atomicWrite(p(requestFile(id)), JSON.stringify(req, null, 2));
  return { id, contentHash };
}

export type BridgeResult =
  | { status: 'disabled' }
  | { status: 'unknown' } // no such request id
  | { status: 'pending' } // request exists, no .done marker yet
  | { status: 'error'; reason: string }
  | { status: 'ready'; proposals: BridgeProposal[]; note?: string };

/**
 * Poll a request. Reads the response ONLY once the `.done` marker exists, then
 * validates schema + content-hash correlation. A confirmed result is consumed
 * (fileset purged) so it can't be double-applied.
 */
export async function readResult(id: string, now: number): Promise<BridgeResult> {
  if (!bridgeEnabled()) return { status: 'disabled' };
  if (!isValidBridgeId(id)) return { status: 'unknown' };
  const reqPath = p(requestFile(id));
  if (!existsSync(reqPath)) return { status: 'unknown' };

  let req: BridgeRequest;
  try {
    req = BridgeRequestSchema.parse(JSON.parse(await readFile(reqPath, 'utf8')));
  } catch {
    await purge(id);
    return { status: 'error', reason: 'corrupt request file' };
  }
  if (isExpired(req, now)) {
    await purge(id);
    return { status: 'error', reason: 'request expired before a response arrived' };
  }
  // The marker is written LAST by the session — its absence means "still working".
  if (!existsSync(p(doneFile(id)))) return { status: 'pending' };

  let result: BridgeResult;
  try {
    const parsed = BridgeResponseSchema.parse(JSON.parse(await readFile(p(responseFile(id)), 'utf8')));
    if (parsed.requestId !== id) {
      result = { status: 'error', reason: 'response requestId does not match' };
    } else if (parsed.contentHash !== req.contentHash) {
      result = { status: 'error', reason: 'scene changed since the request (stale proposal) — please retry' };
    } else {
      result = parsed.note
        ? { status: 'ready', proposals: parsed.proposals, note: parsed.note }
        : { status: 'ready', proposals: parsed.proposals };
    }
  } catch (e) {
    result = { status: 'error', reason: `invalid response: ${(e as Error).message}` };
  }
  await purge(id); // consume once: ready OR hard error
  return result;
}

/** For the bridge:pending CLI — list ids awaiting a human response. */
export async function listPending(now: number): Promise<{ id: string; message: string }[]> {
  await sweepStale(now);
  if (!existsSync(BRIDGE_DIR)) return [];
  const out: { id: string; message: string }[] = [];
  for (const f of await readdir(BRIDGE_DIR)) {
    if (!f.endsWith('.request.json')) continue;
    const id = f.replace('.request.json', '');
    if (existsSync(p(doneFile(id)))) continue; // already answered
    try {
      const req = BridgeRequestSchema.parse(JSON.parse(await readFile(p(f), 'utf8')));
      out.push({ id, message: req.message });
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

/** Read a pending request + its scene snapshot (for the auto-responder). */
export async function readRequestAndScene(id: string): Promise<{ request: BridgeRequest; sceneJson: string } | null> {
  if (!isValidBridgeId(id) || !existsSync(p(requestFile(id)))) return null;
  try {
    const request = BridgeRequestSchema.parse(JSON.parse(await readFile(p(requestFile(id)), 'utf8')));
    const sceneJson = await readFile(p(sceneFile(id)), 'utf8');
    return { request, sceneJson };
  } catch {
    return null;
  }
}

/** Write the response then the `.done` marker LAST (so readers see a complete reply). */
export async function writeResponse(id: string, response: BridgeResponse): Promise<void> {
  await atomicWrite(p(responseFile(id)), JSON.stringify(response, null, 2));
  await atomicWrite(p(doneFile(id)), '');
}
