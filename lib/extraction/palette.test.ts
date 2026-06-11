import { describe, expect, it } from 'vitest';
import { extractPalette, matchSwatchesToMaterials, rgbToHex, hexToRgb } from './palette';

/** Build an RGBA buffer from a list of [r,g,b,a] pixels. */
function buf(pixels: [number, number, number, number][]): Uint8Array {
  const out = new Uint8Array(pixels.length * 4);
  pixels.forEach((p, i) => out.set(p, i * 4));
  return out;
}

const RED: [number, number, number, number] = [255, 0, 0, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CANE: [number, number, number, number] = [202, 165, 106, 255]; // #caa56a
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe('hex/rgb round-trip', () => {
  it('is stable and lowercase 6-digit', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(hexToRgb('#caa56a')).toEqual([202, 165, 106]);
  });
});

describe('extractPalette', () => {
  it('a solid-colour buffer yields ONE swatch even with k>1 (flat box never over-splits)', () => {
    const sw = extractPalette(buf(Array(16).fill(RED)), 8, 2, 4);
    expect(sw).toHaveLength(1);
    expect(sw[0]).toEqual({ hex: '#ff0000', weight: 1 });
  });

  it('splits a two-colour buffer into weighted swatches', () => {
    const sw = extractPalette(buf([...Array(12).fill(RED), ...Array(4).fill(WHITE)]), 16, 1, 4);
    expect(sw).toHaveLength(2);
    expect(sw[0]).toEqual({ hex: '#ff0000', weight: 0.75 });
    expect(sw[1]).toEqual({ hex: '#ffffff', weight: 0.25 });
  });

  it('splits a continuous gradient at the median along its widest channel', () => {
    // 8 pixels ramping R 0,32,...,224 (G=B=0); k=2 should split at the median
    // into the low half (R 0..96) and high half (R 128..224).
    const px: [number, number, number, number][] = [];
    for (let i = 0; i < 8; i++) px.push([i * 32, 0, 0, 255]);
    const sw = extractPalette(buf(px), 8, 1, 2);
    expect(sw).toHaveLength(2);
    // averages: low half mean R = (0+32+64+96)/4 = 48; high = (128+160+192+224)/4 = 176
    const hexes = sw.map((s) => s.hex).sort();
    expect(hexes).toEqual(['#300000', '#b00000']); // 48=0x30, 176=0xb0
    expect(sw[0]!.weight).toBeCloseTo(0.5, 5);
    expect(sw[0]!.weight + sw[1]!.weight).toBeCloseTo(1, 5);
  });

  it('ignores transparent pixels; empty when all transparent', () => {
    const sw = extractPalette(buf([...Array(8).fill(CLEAR), ...Array(8).fill(CANE)]), 16, 1, 4);
    expect(sw).toHaveLength(1);
    expect(sw[0]!.hex).toBe('#caa56a');
    expect(extractPalette(buf(Array(8).fill(CLEAR)), 8, 1, 4)).toEqual([]);
  });
});

describe('matchSwatchesToMaterials', () => {
  it('maps dominant colours to the nearest library material (CIELAB)', () => {
    const cands = matchSwatchesToMaterials([
      { hex: '#ff0000', weight: 0.6 },
      { hex: '#ffffff', weight: 0.3 },
      { hex: '#caa56a', weight: 0.1 },
    ]);
    expect(cands[0]!.materialId).toBe('mat-fabric-rust');
    expect(cands[1]!.materialId).toBe('mat-ceiling-white'); // #f8f6f1 is the closest white in Lab
    expect(cands[2]!.materialId).toBe('mat-cane-natural');
    // preserves order + weight, carries a non-negative distance
    expect(cands.map((c) => c.weight)).toEqual([0.6, 0.3, 0.1]);
    expect(cands.every((c) => c.distance >= 0 && c.metric === 'cielab')).toBe(true);
  });
});
