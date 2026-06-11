import type { ScenePatch } from '../scene/patching';
import type { GeometryCorrectionProposal, HomeScene } from '../scene/schemas';

/**
 * AI provider boundary. Four implementations are planned:
 *
 *  - MockAgentProvider          (default; deterministic, fully offline — P4)
 *  - ClaudeCodeBridgeProvider   (local-only, human-driven file exchange — P4)
 *  - FutureApiProvider          (interface only; paid API automation post-MVP)
 *  - FutureLocalModelProvider   (interface only; e.g. Ollama-served local model)
 *
 * Providers NEVER touch the scene. They return structured proposals that are
 * zod-validated, previewed to the user, and applied through the commit
 * pipeline only after approval.
 */

export type ProviderId = 'mock' | 'claude-code-bridge' | 'future-api' | 'future-local';

export interface ProviderCapabilities {
  proposeEdits: boolean;
  reviewExtraction: boolean;
  generateVariants: boolean;
  analyzeReference: boolean;
  proposeCorrections: boolean;
}

export interface AgentRequestContext {
  scene: HomeScene;
  /** Currently selected entity, when the user is asking about "this". */
  selectedEntityId?: string;
  /** Reference image ids attached to the request. */
  referenceImageIds?: string[];
}

export interface AgentEditProposal {
  id: string;
  summary: string;
  /** Human-readable target description, e.g. "Living Room (walls + floor)". */
  target: string;
  patch: ScenePatch;
  rationale: string;
  confidence: number;
  /** Entities skipped because of lock constraints. */
  skippedLocked: string[];
}

export interface AgentProvider {
  readonly id: ProviderId;
  capabilities(): ProviderCapabilities;
  /** Natural-language request -> structured edit proposals (never auto-applied). */
  proposeEdits(message: string, ctx: AgentRequestContext): Promise<AgentEditProposal[]>;
  /**
   * Produce `count` DISTINCT design options for a room (or the whole home),
   * each a self-contained proposal the user previews and applies one at a time.
   * Optional: providers without the capability omit it.
   */
  generateVariants?(message: string, ctx: AgentRequestContext, count: number): Promise<AgentEditProposal[]>;
  /**
   * Inspect the scene for extraction problems and propose geometry corrections
   * (each previewed → approved → committed). Optional.
   */
  proposeCorrections?(ctx: AgentRequestContext): Promise<GeometryCorrectionProposal[]>;
}

const NONE: ProviderCapabilities = {
  proposeEdits: false,
  reviewExtraction: false,
  generateVariants: false,
  analyzeReference: false,
  proposeCorrections: false,
};

/** Interface-only stubs (per plan: no implementation in MVP). */
export const futureApiProvider: AgentProvider = {
  id: 'future-api',
  capabilities: () => NONE,
  proposeEdits: async () => {
    throw new Error('FutureApiProvider is an interface stub (post-MVP)');
  },
};

export const futureLocalModelProvider: AgentProvider = {
  id: 'future-local',
  capabilities: () => NONE,
  proposeEdits: async () => {
    throw new Error('FutureLocalModelProvider is an interface stub (post-MVP)');
  },
};
