import { describe, expect, it } from 'vitest';
import { scoreConfidence, confidenceTier, reviewQueue } from './confidence';

describe('scoreConfidence', () => {
  it('rewards snapping, dimension match and enclosure; penalises overlap/thinness', () => {
    expect(scoreConfidence({ source: 'extracted' })).toBeCloseTo(0.42, 3);
    expect(scoreConfidence({ source: 'extracted', snappedToWall: true, dimensionMatched: true, fullyEnclosed: true })).toBeCloseTo(0.89, 2);
    expect(scoreConfidence({ source: 'extracted', overlapsOther: true, tooThin: true })).toBeLessThan(0.1);
    expect(scoreConfidence({ source: 'manual', snappedToWall: true })).toBe(1); // clamps at 1
  });
});

describe('confidenceTier', () => {
  it('buckets scores', () => {
    expect(confidenceTier(0.3)).toBe('low');
    expect(confidenceTier(0.6)).toBe('medium');
    expect(confidenceTier(0.9)).toBe('high');
  });
});

describe('reviewQueue', () => {
  it('returns only low-confidence entities, worst first', () => {
    const ents = [{ id: 'a', confidence: 0.9 }, { id: 'b', confidence: 0.2 }, { id: 'c', confidence: 0.45 }];
    expect(reviewQueue(ents).map((e) => e.id)).toEqual(['b', 'c']);
  });
});
