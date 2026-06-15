import { describe, expect, it } from 'vitest';
import { adaptiveMaskFromGrayscale } from './adaptive-mask';
import { maskFromGrayscale } from './image-mask';

/**
 * Build a w*h row-major grayscale buffer from a (x,y)→value generator.
 * Keeps the visual layout of each test obvious without hand-indexing.
 */
function makeGray(
  w: number,
  h: number,
  fn: (x: number, y: number) => number,
): number[] {
  const g = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) g[y * w + x] = fn(x, y);
  }
  return g;
}

/** Count true cells — a density proxy for option-sensitivity assertions. */
function countWall(mask: boolean[][]): number {
  let n = 0;
  for (const row of mask) for (const v of row) if (v) n++;
  return n;
}

describe('adaptiveMaskFromGrayscale', () => {
  it('recovers a constant-contrast border across a strong lighting gradient, where global Otsu cannot', () => {
    // 40x40 background ramps dark-left (~30) to light-right (~220). A rectangle
    // BORDER (2px thick, inset by 5) is drawn a fixed 60 below the local
    // background everywhere, so its contrast is constant even though its absolute
    // value on the bright side (~160) is far above the dark side's background.
    const w = 40;
    const h = 40;
    const bg = (x: number): number => 30 + Math.round((x / (w - 1)) * 190);
    const inset = 5;
    const onBorder = (x: number, y: number): boolean => {
      const inOuter = x >= inset && x < w - inset && y >= inset && y < h - inset;
      if (!inOuter) return false;
      const inInner =
        x >= inset + 2 && x < w - inset - 2 && y >= inset + 2 && y < h - inset - 2;
      return !inInner;
    };
    const gray = makeGray(w, h, (x, y) =>
      onBorder(x, y) ? Math.max(0, bg(x) - 60) : bg(x),
    );

    const adaptive = adaptiveMaskFromGrayscale(gray, w, h, { window: 15, c: 5 });

    // Every border pixel — including the washed-out RIGHT side — must be wall.
    let recovered = 0;
    let borderTotal = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (onBorder(x, y)) {
          borderTotal++;
          if (adaptive[y]![x]) recovered++;
        }
      }
    }
    expect(borderTotal).toBeGreaterThan(0);
    expect(recovered).toBe(borderTotal);

    // Contrast: a single GLOBAL Otsu threshold loses part of that same border,
    // proving the adaptive method is doing something a global cut cannot.
    const global = maskFromGrayscale(gray, w, h);
    let globalRecovered = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (onBorder(x, y) && global[y]![x]) globalRecovered++;
      }
    }
    expect(globalRecovered).toBeLessThan(borderTotal);
  });

  it('marks a dark bar as wall on a flat background', () => {
    // Flat 200 background with a vertical dark (40) bar in columns 4..5.
    const w = 10;
    const h = 8;
    const gray = makeGray(w, h, (x) => (x === 4 || x === 5 ? 40 : 200));
    const mask = adaptiveMaskFromGrayscale(gray, w, h, { window: 5, c: 8 });

    for (let y = 0; y < h; y++) {
      expect(mask[y]![4]).toBe(true);
      expect(mask[y]![5]).toBe(true);
      // A representative flat-background column stays non-wall.
      expect(mask[y]![0]).toBe(false);
      expect(mask[y]![9]).toBe(false);
    }
  });

  it('invert flips every cell of the result', () => {
    const w = 10;
    const h = 8;
    const gray = makeGray(w, h, (x) => (x === 4 || x === 5 ? 40 : 200));
    const normal = adaptiveMaskFromGrayscale(gray, w, h, { window: 5, c: 8 });
    const inverted = adaptiveMaskFromGrayscale(gray, w, h, {
      window: 5,
      c: 8,
      invert: true,
    });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(inverted[y]![x]).toBe(!normal[y]![x]);
      }
    }
  });

  it('higher c yields no more wall pixels (stricter bias)', () => {
    // A soft, noisy-ish gradient with a faint dark feature: raising c should only
    // remove marginal wall pixels, never add them.
    const w = 24;
    const h = 24;
    const gray = makeGray(w, h, (x, y) => {
      const base = 120 + ((x * 3 + y * 2) % 30); // mild texture
      const feature = x >= 10 && x <= 13 ? 20 : 0; // faint dark stripe
      return base - feature;
    });
    const low = adaptiveMaskFromGrayscale(gray, w, h, { window: 7, c: 2 });
    const high = adaptiveMaskFromGrayscale(gray, w, h, { window: 7, c: 20 });
    expect(countWall(high)).toBeLessThanOrEqual(countWall(low));
    // And the strong end (c very high) suppresses essentially everything.
    const veryHigh = adaptiveMaskFromGrayscale(gray, w, h, { window: 7, c: 200 });
    expect(countWall(veryHigh)).toBe(0);
  });

  it('shape is h rows by w columns and output is deterministic', () => {
    const w = 6;
    const h = 9;
    const gray = makeGray(w, h, (x, y) => (x + y) * 10);
    const a = adaptiveMaskFromGrayscale(gray, w, h, { window: 3, c: 4 });
    const b = adaptiveMaskFromGrayscale(gray, w, h, { window: 3, c: 4 });
    expect(a.length).toBe(h);
    for (let y = 0; y < h; y++) {
      expect(a[y]!.length).toBe(w);
      expect(a[y]).toEqual(b[y]); // same input → byte-identical output
    }
  });

  it('even window rounds down to odd without throwing', () => {
    const w = 12;
    const h = 12;
    const gray = makeGray(w, h, (x) => (x < 6 ? 50 : 200));
    // window:32 must behave like window:31 (symmetric half-extent of 15/16 etc).
    const even = adaptiveMaskFromGrayscale(gray, w, h, { window: 8, c: 5 });
    const odd = adaptiveMaskFromGrayscale(gray, w, h, { window: 7, c: 5 });
    expect(even).toEqual(odd);
  });

  it('returns [] for zero / negative dimensions', () => {
    expect(adaptiveMaskFromGrayscale([], 0, 0)).toEqual([]);
    expect(adaptiveMaskFromGrayscale([], 0, 5)).toEqual([]);
    expect(adaptiveMaskFromGrayscale([1, 2, 3], 5, 0)).toEqual([]);
    expect(adaptiveMaskFromGrayscale([1, 2, 3], -3, 4)).toEqual([]);
  });

  it('accepts a Uint8Array buffer identically to number[]', () => {
    const w = 8;
    const h = 8;
    const arr = makeGray(w, h, (x) => (x === 3 ? 30 : 210));
    const typed = Uint8Array.from(arr);
    expect(adaptiveMaskFromGrayscale(typed, w, h, { window: 5, c: 8 })).toEqual(
      adaptiveMaskFromGrayscale(arr, w, h, { window: 5, c: 8 }),
    );
  });
});
