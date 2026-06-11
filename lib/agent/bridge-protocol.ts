/**
 * ClaudeCodeBridgeProvider wire protocol (Phase 4) — PURE, shared by the sidecar
 * (file IO), the browser provider (HTTP), and tests.
 *
 * Design facts that shape this (see plan §8):
 *  - Local & human-driven. The app drops a request file; a separate local Claude
 *    Code session reads it, proposes edits, and drops a response file. There is
 *    NO programmatic call to any subscription account.
 *  - Honest. The scene JSON is shown to the human session — "local-first" means
 *    the *app* never uploads, not that a human can't choose to paste it.
 *  - Race-proof. The response is written first, then an empty `.done` marker
 *    LAST; readers act only once `.done` exists. A content hash correlates a
 *    response to its request so a stale file can't be mismatched.
 *
 * Nothing here trusts raw model output: every proposal carries a real
 * ScenePatch that is zod-validated here, then re-validated by the commit
 * pipeline before anything mutates the scene.
 */
import { z } from 'zod';
import { ScenePatchSchema } from '../scene/patching';

export const BRIDGE_SCHEMA_VERSION = 1 as const;

/** A request expires after this long; the sidecar sweeps stale files on access. */
export const BRIDGE_TTL_MS = 1000 * 60 * 30; // 30 minutes

/** Mirrors AgentEditProposal, but as a validated schema for untrusted input. */
export const BridgeProposalSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  target: z.string().min(1),
  patch: ScenePatchSchema,
  rationale: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.6),
  skippedLocked: z.array(z.string()).default([]),
});
export type BridgeProposal = z.infer<typeof BridgeProposalSchema>;

export const BridgeRequestSchema = z.object({
  schemaVersion: z.literal(BRIDGE_SCHEMA_VERSION),
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  message: z.string().min(1),
  /** Hash of the scene JSON snapshot this request was built against. */
  contentHash: z.string().min(1),
  selectedEntityId: z.string().optional(),
});
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;

export const BridgeResponseSchema = z.object({
  schemaVersion: z.literal(BRIDGE_SCHEMA_VERSION),
  requestId: z.string().min(1),
  /** Must echo the request's contentHash — guards against a mismatched paste. */
  contentHash: z.string().min(1),
  proposals: z.array(BridgeProposalSchema),
  note: z.string().optional(),
});
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

// --- file naming (one request id -> a small fileset under bridge/) ------------
export const requestFile = (id: string) => `${id}.request.json`;
export const sceneFile = (id: string) => `${id}.scene.json`;
export const responseFile = (id: string) => `${id}.response.json`;
export const doneFile = (id: string) => `${id}.done`;

const ID_RE = /^[a-zA-Z0-9-]{6,64}$/;
/** Reject anything that isn't a plain uuid-ish id (no path traversal). */
export const isValidBridgeId = (id: string): boolean => ID_RE.test(id);

export const isExpired = (req: Pick<BridgeRequest, 'createdAt'>, now: number): boolean =>
  now - req.createdAt > BRIDGE_TTL_MS;

/**
 * Tiny deterministic FNV-1a-ish hash. Not cryptographic — only needs to detect
 * "is this the same scene snapshot" cheaply, identically, in browser and Node.
 */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Paste-ready prompt for a human-driven local Claude Code session. */
export function buildBridgePrompt(req: BridgeRequest, sceneJson: string): string {
  return [
    `You are the HomeCanvas design bridge. A local app asked for an edit.`,
    ``,
    `USER REQUEST: ${req.message}`,
    req.selectedEntityId ? `SELECTED ENTITY: ${req.selectedEntityId}` : ``,
    ``,
    `Propose edits as ScenePatch ops against the scene below. Reply with ONLY a`,
    `JSON object matching this shape and write it to bridge/${responseFile(req.id)},`,
    `then create an empty file bridge/${doneFile(req.id)} LAST:`,
    ``,
    `{`,
    `  "schemaVersion": ${BRIDGE_SCHEMA_VERSION},`,
    `  "requestId": "${req.id}",`,
    `  "contentHash": "${req.contentHash}",`,
    `  "proposals": [{ "id","summary","target","patch": {"id","ops":[...],"origin":"agent","description"},"rationale","confidence","skippedLocked":[] }]`,
    `}`,
    ``,
    `SCENE JSON:`,
    sceneJson,
  ]
    .filter((l) => l !== ``)
    .join('\n');
}
