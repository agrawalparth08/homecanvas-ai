/**
 * Deterministic intent parser for the MockAgentProvider (Phase 4).
 * Keyword/rule based — no LLM. Maps a message to one editing intent; the
 * provider resolves the room target against the scene.
 */
import { resolveColor, resolveFurniture, resolveMaterial, resolveStylePack, STYLE_PACK_ALIASES, wantsWholeHome } from './vocab';

export type SurfaceTarget = 'floor' | 'walls' | 'ceiling' | 'all';

export interface ParsedIntent {
  action: 'recolor' | 'material' | 'style' | 'variants' | 'furniture' | 'revert' | 'unknown';
  surface: SurfaceTarget;
  color?: string;
  materialId?: string;
  stylePackId?: string;
  /** For 'variants': how many distinct options to generate (2–5, default 3). */
  count?: number;
  /** For 'furniture': catalog key of the piece to add. */
  furnitureKey?: string;
  wholeHome: boolean;
  reason?: string;
}

// Derived from the alias table so a multiword alias (e.g. "black and white")
// always triggers the style-signal gate — never falls out of sync and gets
// mis-routed to a colour/material match. Plus the two-word pack display names.
const MULTIWORD_PACKS = [
  ...Object.keys(STYLE_PACK_ALIASES).filter((k) => k.includes(' ')),
  'rajasthani heritage', 'fusion japandi',
];

export function parseIntent(message: string): ParsedIntent {
  const t = message.toLowerCase();
  const wholeHome = wantsWholeHome(t);
  const surface: SurfaceTarget = /\b(floor|flooring|tiles?)\b/.test(t)
    ? 'floor'
    : /\bwalls?\b/.test(t)
      ? 'walls'
      : /\bceiling\b/.test(t)
        ? 'ceiling'
        : 'all';

  if (/\b(undo|revert|go back|never ?mind|cancel that)\b/.test(t)) return { action: 'revert', surface, wholeHome };

  // "3 variants of the master bedroom", "show me options for the kitchen".
  if (/\b(variants?|variations?|options?|alternatives?)\b/.test(t)) {
    const num = t.match(/\b([2-9])\b/);
    const count = num ? Math.min(5, Math.max(2, Number(num[1]))) : 3;
    return { action: 'variants', surface: 'all', count, wholeHome };
  }

  // "add a sofa to the lounge", "place a coffee table".
  if (/\b(add|place|put|insert)\b/.test(t)) {
    const f = resolveFurniture(t);
    if (f) return { action: 'furniture', surface: 'all', furnitureKey: f.value, wholeHome };
  }

  const pack = resolveStylePack(t);
  const styleSignal = /\b(style|theme|look|pack|vibe|aesthetic)\b/.test(t) || MULTIWORD_PACKS.some((p) => t.includes(p));
  if (pack && styleSignal) return { action: 'style', surface: 'all', stylePackId: pack.value, wholeHome };

  const mat = resolveMaterial(t);
  if (mat) return { action: 'material', surface, materialId: mat.value, wholeHome };

  const col = resolveColor(t);
  if (col) return { action: 'recolor', surface, color: col.value, wholeHome };

  if (pack) return { action: 'style', surface: 'all', stylePackId: pack.value, wholeHome };

  return {
    action: 'unknown',
    surface,
    wholeHome,
    reason:
      'I can recolour or re-material a room’s floor / walls / ceiling, or apply a style pack. Try: "paint the lounge walls sage green", "make the kitchen floor walnut", or "apply contemporary luxury to the master bedroom".',
  };
}
