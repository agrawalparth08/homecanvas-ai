import { describe, it, expect } from 'vitest';
import {
  dimensionSamples,
  type OcrWord,
  type DimLine,
} from './ocr-dimensions';
import { mmPerPxFromDimensions } from './auto-scale';

// A 300px horizontal line at y=100, spanning x=0..300.
const HLINE: DimLine = { x0: 0, y0: 100, x1: 300, y1: 100 };

describe('dimensionSamples', () => {
  it('associates a dimension word with the nearest line (its px length)', () => {
    // "3600" centred just below the midpoint of a 300px line -> pixels=300.
    const words: OcrWord[] = [{ text: '3600', cx: 150, cy: 110, w: 40, h: 12 }];
    const out = dimensionSamples(words, [HLINE]);
    expect(out).toEqual([{ text: '3600', pixels: 300 }]);
  });

  it('skips non-dimension words (e.g. "KITCHEN")', () => {
    const words: OcrWord[] = [{ text: 'KITCHEN', cx: 150, cy: 110, w: 80, h: 14 }];
    expect(dimensionSamples(words, [HLINE])).toEqual([]);
  });

  it('skips a dimension word with no line within maxDistPx', () => {
    // Word centre is 500px away from the line in y -> beyond default 60px.
    const words: OcrWord[] = [{ text: '3600', cx: 150, cy: 600, w: 40, h: 12 }];
    expect(dimensionSamples(words, [HLINE])).toEqual([]);
  });

  it('emits two samples, one per nearby line, in input word order', () => {
    const vline: DimLine = { x0: 800, y0: 0, x1: 800, y1: 200 }; // length 200
    const words: OcrWord[] = [
      { text: '3600', cx: 150, cy: 110, w: 40, h: 12 }, // near HLINE (300px)
      { text: '2400', cx: 790, cy: 100, w: 40, h: 12 }, // near vline (200px)
    ];
    const out = dimensionSamples(words, [HLINE, vline]);
    expect(out).toEqual([
      { text: '3600', pixels: 300 },
      { text: '2400', pixels: 200 },
    ]);
  });

  it('picks the nearest of several lines for one word', () => {
    const far: DimLine = { x0: 0, y0: 50, x1: 40, y1: 50 }; // 40px line, ~50px away in y
    const near: DimLine = { x0: 100, y0: 112, x1: 220, y1: 112 }; // 120px line, ~2px away
    const words: OcrWord[] = [{ text: '1200', cx: 150, cy: 110, w: 40, h: 12 }];
    const out = dimensionSamples(words, [far, near]);
    expect(out).toEqual([{ text: '1200', pixels: 120 }]);
  });

  it('respects a custom maxDistPx', () => {
    // 45px below the line: outside maxDistPx=30, inside the default 60.
    const words: OcrWord[] = [{ text: '3600', cx: 150, cy: 145, w: 40, h: 12 }];
    expect(dimensionSamples(words, [HLINE], { maxDistPx: 30 })).toEqual([]);
    expect(dimensionSamples(words, [HLINE], { maxDistPx: 60 })).toEqual([
      { text: '3600', pixels: 300 },
    ]);
  });

  it('clamps distance to the segment endpoints (point beyond the end)', () => {
    // Word sits 10px past the right end (x=310) at the same y; clamped distance
    // is to the endpoint (~10px), well within range -> associated.
    const words: OcrWord[] = [{ text: '3600', cx: 310, cy: 100, w: 40, h: 12 }];
    const out = dimensionSamples(words, [HLINE]);
    expect(out).toEqual([{ text: '3600', pixels: 300 }]);
  });

  it('skips when there are no lines at all', () => {
    const words: OcrWord[] = [{ text: '3600', cx: 150, cy: 110, w: 40, h: 12 }];
    expect(dimensionSamples(words, [])).toEqual([]);
  });

  it('handles a degenerate (zero-length) line: never emits a 0px span', () => {
    const dot: DimLine = { x0: 150, y0: 105, x1: 150, y1: 105 };
    const words: OcrWord[] = [{ text: '3600', cx: 150, cy: 110, w: 40, h: 12 }];
    // Nearest "line" is the dot (within range) but its length is 0 -> skipped.
    expect(dimensionSamples(words, [dot])).toEqual([]);
  });

  it('feeds into mmPerPxFromDimensions for a sensible mm/px', () => {
    // 3600mm over a 300px span -> 12 mm/px.
    const words: OcrWord[] = [{ text: '3600', cx: 150, cy: 110, w: 40, h: 12 }];
    const samples = dimensionSamples(words, [HLINE]);
    const scale = mmPerPxFromDimensions(samples);
    expect(scale).not.toBeNull();
    expect(scale!.samples).toBe(1);
    expect(scale!.mmPerPx).toBe(12);
  });
});
