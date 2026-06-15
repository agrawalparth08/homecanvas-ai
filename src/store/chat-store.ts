import { create } from 'zustand';
import type { AgentEditProposal } from '@lib/agent/provider';

/**
 * Assistant conversation state, kept in a session-level store (not ChatPanel's
 * local state) so the history survives switching tabs (Inspector / Log) and
 * navigating between pages within the session. Resets only on a full reload.
 */
export interface ChatMsg {
  role: 'user' | 'agent';
  text: string;
  proposal?: AgentEditProposal;
  done?: 'applied' | 'dismissed' | 'rejected';
  /** Thumbnail (data URL) shown in a user message. */
  image?: string;
  /** Extracted palette swatches shown as a colour row. */
  palette?: string[];
}

export const GREETING: ChatMsg = {
  role: 'agent',
  text: 'Tell me a change — e.g. “paint the lounge walls sage green”, “add a sofa to the drawing room”, “3 variants of the master bedroom”, or attach a photo and say “recolour the bedroom from this”.',
};

interface ChatState {
  msgs: ChatMsg[];
  provider: 'mock' | 'bridge';
  /** True once the user manually picked an engine, so auto-select won't override it on remount. */
  providerPinned: boolean;
  setMsgs: (update: ChatMsg[] | ((cur: ChatMsg[]) => ChatMsg[])) => void;
  /** User explicitly chose an engine (pins the choice). */
  chooseProvider: (p: 'mock' | 'bridge') => void;
  /** Startup default (e.g. bridge when available) — respected only if the user hasn't pinned. */
  autoSelectProvider: (p: 'mock' | 'bridge') => void;
  resetChat: () => void;
}

export const useChat = create<ChatState>((set) => ({
  msgs: [GREETING],
  provider: 'mock',
  providerPinned: false,
  setMsgs: (update) => set((s) => ({ msgs: typeof update === 'function' ? update(s.msgs) : update })),
  chooseProvider: (p) => set({ provider: p, providerPinned: true }),
  autoSelectProvider: (p) => set((s) => (s.providerPinned ? s : { provider: p })),
  resetChat: () => set({ msgs: [GREETING], provider: 'mock', providerPinned: false }),
}));
