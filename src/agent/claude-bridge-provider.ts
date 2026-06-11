/**
 * Browser side of the ClaudeCodeBridgeProvider (Phase 4). Talks to the sidecar
 * over /api/bridge/*; the sidecar owns the local file exchange. This is
 * human-driven by design: after submitting, a person runs `npm run bridge:pending`
 * in a local Claude Code session, which proposes edits and drops a response file.
 *
 * The proposals returned here are NOT trusted — each carries a real ScenePatch
 * that the commit pipeline re-validates before anything changes.
 */
import type { AgentEditProposal, AgentProvider, AgentRequestContext } from '@lib/agent/provider';
import type { BridgeProposal } from '@lib/agent/bridge-protocol';

export type BridgeRunResult =
  | { status: 'ready'; proposals: AgentEditProposal[]; note?: string }
  | { status: 'pending' } // still waiting when the caller's budget ran out
  | { status: 'error'; reason: string }
  | { status: 'disabled' };

export interface BridgeRunOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Called once, the first time the request is confirmed queued and waiting. */
  onWaiting?: (id: string) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function checkBridgeEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/bridge/status');
    if (!res.ok) return false;
    return ((await res.json()) as { enabled: boolean }).enabled === true;
  } catch {
    return false;
  }
}

const toProposal = (b: BridgeProposal): AgentEditProposal => ({
  id: b.id,
  summary: b.summary,
  target: b.target,
  patch: b.patch,
  rationale: b.rationale,
  confidence: b.confidence,
  skippedLocked: b.skippedLocked,
});

export async function runBridge(
  message: string,
  ctx: AgentRequestContext,
  opts: BridgeRunOptions = {},
): Promise<BridgeRunResult> {
  const { timeoutMs = 5 * 60_000, intervalMs = 1500, onWaiting, signal } = opts;
  let id: string;
  try {
    const res = await fetch('/api/bridge/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        scene: ctx.scene,
        ...(ctx.selectedEntityId ? { selectedEntityId: ctx.selectedEntityId } : {}),
      }),
    });
    if (res.status === 403) return { status: 'disabled' };
    if (!res.ok) return { status: 'error', reason: `submit failed (${res.status})` };
    id = ((await res.json()) as { id: string }).id;
  } catch {
    return { status: 'error', reason: 'could not reach the local sidecar' };
  }

  onWaiting?.(id);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return { status: 'pending' };
    await sleep(intervalMs);
    try {
      const res = await fetch(`/api/bridge/request/${id}`);
      const body = (await res.json()) as
        | { status: 'pending' | 'unknown' }
        | { status: 'disabled' }
        | { status: 'error'; reason: string }
        | { status: 'ready'; proposals: BridgeProposal[]; note?: string };
      if (body.status === 'ready') {
        return body.note
          ? { status: 'ready', proposals: body.proposals.map(toProposal), note: body.note }
          : { status: 'ready', proposals: body.proposals.map(toProposal) };
      }
      if (body.status === 'error') return { status: 'error', reason: body.reason };
      if (body.status === 'disabled') return { status: 'disabled' };
      if (body.status === 'unknown') return { status: 'error', reason: 'request was swept (expired)' };
      // 'pending' -> keep polling
    } catch {
      // transient fetch hiccup -> keep polling until the deadline
    }
  }
  return { status: 'pending' };
}

/** AgentProvider-shaped wrapper (returns [] on any non-ready outcome). */
export const claudeBridgeProvider: AgentProvider = {
  id: 'claude-code-bridge',
  capabilities: () => ({
    proposeEdits: true,
    reviewExtraction: false,
    generateVariants: true,
    analyzeReference: false,
    proposeCorrections: false,
  }),
  proposeEdits: async (message, ctx) => {
    const r = await runBridge(message, ctx);
    return r.status === 'ready' ? r.proposals : [];
  },
  generateVariants: async (message, ctx) => {
    const r = await runBridge(message, ctx);
    return r.status === 'ready' ? r.proposals : [];
  },
};
