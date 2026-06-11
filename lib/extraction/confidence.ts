/**
 * Confidence scoring for extracted geometry (Phase 3).
 *
 * Every extracted entity gets a 0..1 score from its provenance + sanity signals;
 * low-confidence entities render ghosted and queue for human review, and agents
 * won't build on them. Pure + deterministic so the review queue is testable.
 */

export type SourceKind = 'sample' | 'manual' | 'traced' | 'extracted' | 'agent';

export interface ConfidenceFactors {
  source: SourceKind;
  /** edge snapped onto a real wall line */
  snappedToWall?: boolean;
  /** size agrees with a read dimension annotation */
  dimensionMatched?: boolean;
  /** overlaps another entity (likely a mis-detection) */
  overlapsOther?: boolean;
  /** degenerate / sub-minimum size */
  tooThin?: boolean;
  /** enclosed by walls on all sides (rooms) */
  fullyEnclosed?: boolean;
}

const BASE: Record<SourceKind, number> = {
  sample: 1, manual: 0.92, agent: 0.7, traced: 0.6, extracted: 0.42,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0..1 confidence for an extracted entity. */
export function scoreConfidence(f: ConfidenceFactors): number {
  let s = BASE[f.source];
  if (f.snappedToWall) s += 0.2;
  if (f.dimensionMatched) s += 0.15;
  if (f.fullyEnclosed) s += 0.12;
  if (f.overlapsOther) s -= 0.3;
  if (f.tooThin) s -= 0.35;
  return clamp01(Number(s.toFixed(3)));
}

export type ConfidenceTier = 'low' | 'medium' | 'high';

/** Bucket a score: <0.5 low (review), <0.75 medium, else high. */
export function confidenceTier(score: number): ConfidenceTier {
  if (score < 0.5) return 'low';
  if (score < 0.75) return 'medium';
  return 'high';
}

/** Entities needing human review (low tier), worst first. */
export function reviewQueue<T extends { confidence: number }>(entities: T[]): T[] {
  return entities.filter((e) => confidenceTier(e.confidence) === 'low').sort((a, b) => a.confidence - b.confidence);
}
