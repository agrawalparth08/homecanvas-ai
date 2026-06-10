import { buildStylePackApplication } from '../styles/apply';
import { STYLE_PACKS } from '../styles/style-packs';
import type { AgentEditProposal, AgentProvider, AgentRequestContext, ProviderCapabilities } from './provider';

/**
 * Deterministic offline provider — the MVP default. Phase 4 grows this into a
 * full rule-based intent parser (colors, materials, scopes, variants); for
 * Phase 1 it resolves "apply <style> to <room>" requests so the provider
 * boundary is real end-to-end.
 */

let proposalCounter = 0;

export const mockAgentProvider: AgentProvider = {
  id: 'mock',

  capabilities(): ProviderCapabilities {
    return {
      proposeEdits: true,
      reviewExtraction: false,
      generateVariants: false,
      analyzeReference: false,
      proposeCorrections: false,
    };
  },

  async proposeEdits(message: string, ctx: AgentRequestContext): Promise<AgentEditProposal[]> {
    const lower = message.toLowerCase();

    const pack = STYLE_PACKS.find(
      (p) => lower.includes(p.id.replace(/-/g, ' ')) || lower.includes(p.name.toLowerCase()),
    );
    if (!pack) return [];

    const rooms = ctx.scene.floors.flatMap((f) => f.rooms);
    const namedRoom = rooms.find((r) => lower.includes(r.name.toLowerCase()) || lower.includes(r.kind.toLowerCase()));
    const wholeHome = lower.includes('whole home') || lower.includes('entire') || lower.includes('all rooms');

    const target = wholeHome
      ? ('wholeHome' as const)
      : { roomIds: [namedRoom?.id ?? ctx.selectedEntityId ?? rooms[0]?.id ?? ''] };
    const application = buildStylePackApplication(ctx.scene, pack, target, 'skip');
    if (!application.patch) return [];

    proposalCounter += 1;
    return [
      {
        id: `mock-proposal-${proposalCounter}`,
        summary: application.patch.description,
        target: wholeHome ? 'Whole home' : (namedRoom?.name ?? 'Selected room'),
        patch: application.patch,
        rationale: pack.reasoning,
        confidence: namedRoom || wholeHome ? 0.9 : 0.6,
        skippedLocked: application.skipped,
      },
    ];
  },
};
