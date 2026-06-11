/**
 * Site-photo palette extraction (Phase 5), pure + deterministic + offline.
 *
 * extractPalette: median-cut quantization over an RGBA buffer -> top-K dominant
 * swatches. A flat (zero-range) box is NEVER split, so a solid-colour photo
 * yields one swatch, not K duplicates.
 *
 * matchSwatchesToMaterials: map each swatch to the nearest MATERIAL_LIBRARY
 * material by CIELAB ΔE (CIE76) — perceptually correct for the warm earth-tone-
 * heavy library, where raw-RGB distance mis-ranks close browns/beiges.
 *
 * Swatch/MaterialCandidate are plain TS interfaces (like lib/geometry helpers);
 * promote to zod only if these ever get persisted into the scene graph.
 */
import { MATERIAL_LIBRARY } from '../styles/material-library';

export interface Swatch {
  /** '#rrggbb' lowercase. */
  hex: string;
  /** Fraction of sampled opaque pixels, [0,1]. Swatches are weight-desc. */
  weight: number;
}

export interface MaterialCandidate {
  materialId: string;
  /** The source swatch colour. */
  hex: string;
  weight: number;
  /** CIELAB ΔE between the swatch and the material's baseColor. */
  distance: number;
  metric: 'cielab';
}

type RGB = [number, number, number];

// --- colour conversions ------------------------------------------------------

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

const srgbToLinear = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

export function rgbToLab([r, g, b]: RGB): RGB {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  // linear sRGB -> XYZ (D65)
  let x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  let y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  let z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// --- median-cut quantization -------------------------------------------------

function widestChannel(box: RGB[]): { channel: number; range: number } {
  const min: RGB = [255, 255, 255];
  const max: RGB = [0, 0, 0];
  for (const p of box) {
    for (let c = 0; c < 3; c++) {
      if (p[c]! < min[c]!) min[c] = p[c]!;
      if (p[c]! > max[c]!) max[c] = p[c]!;
    }
  }
  let channel = 0;
  let range = -1;
  for (let c = 0; c < 3; c++) {
    const r = max[c]! - min[c]!;
    if (r > range) {
      range = r;
      channel = c;
    }
  }
  return { channel, range };
}

/** Total order along (channel, then the other two) for a stable median split. */
function compareAlong(channel: number) {
  const c1 = (channel + 1) % 3;
  const c2 = (channel + 2) % 3;
  return (p: RGB, q: RGB) => p[channel]! - q[channel]! || p[c1]! - q[c1]! || p[c2]! - q[c2]!;
}

export function extractPalette(rgba: Uint8Array, width: number, height: number, k = 5): Swatch[] {
  const totalPx = width * height;
  const step = Math.max(1, Math.floor(totalPx / 20000)); // deterministic decimation
  const pixels: RGB[] = [];
  for (let i = 0; i < totalPx; i += step) {
    const o = i * 4;
    if (rgba[o + 3]! < 128) continue; // skip transparent
    pixels.push([rgba[o]!, rgba[o + 1]!, rgba[o + 2]!]);
  }
  if (pixels.length === 0) return [];

  const boxes: RGB[][] = [pixels];
  while (boxes.length < k) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      if (box.length < 2) continue;
      const score = widestChannel(box).range * box.length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestScore <= 0) break; // nothing splittable (flat box)
    const box = boxes[bestIdx]!;
    const { channel } = widestChannel(box);
    box.sort(compareAlong(channel));
    const mid = box.length >> 1;
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
  }

  // average each box; weight = share of sampled opaque pixels
  const total = pixels.length;
  const byHex = new Map<string, number>();
  for (const box of boxes) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of box) {
      r += p[0];
      g += p[1];
      b += p[2];
    }
    const hex = rgbToHex(r / box.length, g / box.length, b / box.length);
    byHex.set(hex, (byHex.get(hex) ?? 0) + box.length / total);
  }
  return [...byHex.entries()]
    .map(([hex, weight]) => ({ hex, weight }))
    .sort((a, b) => b.weight - a.weight || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0));
}

// --- nearest-material mapping ------------------------------------------------

const LIB_LAB = MATERIAL_LIBRARY.map((m) => ({ id: m.id, lab: rgbToLab(hexToRgb(m.baseColor)) }));

export function matchSwatchesToMaterials(swatches: Swatch[]): MaterialCandidate[] {
  return swatches.map((s) => {
    const lab = rgbToLab(hexToRgb(s.hex));
    let bestId = LIB_LAB[0]!.id;
    let bestD = Infinity;
    for (const m of LIB_LAB) {
      const d = labDistance(lab, m.lab);
      if (d < bestD) {
        bestD = d;
        bestId = m.id;
      }
    }
    return { materialId: bestId, hex: s.hex, weight: s.weight, distance: bestD, metric: 'cielab' as const };
  });
}
