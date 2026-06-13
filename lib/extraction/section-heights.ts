/**
 * Section / elevation height parsing (pure core, no PDF/CV).
 *
 * Architectural section and elevation drawings encode vertical storey heights as
 * horizontal lines (floor/ceiling LEVELS) stacked up the page, often annotated
 * with feet-inches dimension texts. This module clusters those horizontal lines
 * into discrete levels and derives a storey height in millimetres, refined by any
 * parseable dimension annotations. Geometry-style pure function: inputs come from
 * upstream vectorization (trusted shape), so no zod here.
 */
import { parseFeetInches } from '../geometry/scale';

export interface SectionText { text: string; x: number; y: number; }
export interface SectionHLine { y: number; x0: number; x1: number; }
export interface SectionHeightsInput {
  texts: SectionText[];
  hLines: SectionHLine[];
}
export interface SectionHeightsOptions {
  /** Real-world millimetres per drawing unit (defaults to 1 — units already mm). */
  mmPerUnit?: number;
  /** Lines within this many units of each other collapse into one level. */
  clusterTolerance?: number;
}
export interface SectionHeights {
  storeyHeightMm: number;
  levelYs: number[];
  parapetMm?: number;
}

/**
 * Parse one section annotation to a real-world height in mm: feet-inches first
 * (e.g. 10'0"), then a plain millimetre figure (e.g. 3050) like an mm storey tag.
 */
function parseHeightText(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  const ft = parseFeetInches(t);
  if (ft != null) return ft;
  const m = t.match(/^(\d{3,5})(?:\s*mm)?$/i);
  return m ? Number(m[1]) : null;
}

/** Median of a non-empty numeric array (average of the two middle items if even). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Cluster horizontal lines into floor/ceiling levels by their y coordinate.
 * Returns the cluster-mean y of each level, sorted ascending.
 */
function clusterLevels(hLines: SectionHLine[], tolerance: number): number[] {
  if (hLines.length === 0) return [];
  const ys = hLines.map((l) => l.y).sort((a, b) => a - b);
  const levels: number[] = [];
  let bucket: number[] = [ys[0]!];
  for (let i = 1; i < ys.length; i++) {
    const y = ys[i]!;
    if (y - bucket[bucket.length - 1]! <= tolerance) bucket.push(y);
    else {
      levels.push(bucket.reduce((s, v) => s + v, 0) / bucket.length);
      bucket = [y];
    }
  }
  levels.push(bucket.reduce((s, v) => s + v, 0) / bucket.length);
  return levels;
}

/**
 * Parse section/elevation height info: cluster horizontal lines into levels,
 * take the median adjacent-level spacing as the storey height (scaled by
 * mmPerUnit), and refine it against any feet-inches dimension texts. A short
 * topmost level (under ~60% of a storey) is reported as the parapet.
 */
export function parseSectionHeights(
  input: SectionHeightsInput,
  opts: SectionHeightsOptions = {},
): SectionHeights {
  const mmPerUnit = opts.mmPerUnit ?? 1;
  const tolerance = opts.clusterTolerance ?? 1e-6;

  const levelYs = clusterLevels(input.hLines, tolerance);

  // Adjacent-level spacings (drawing units) → millimetres.
  const spacings: number[] = [];
  for (let i = 1; i < levelYs.length; i++) spacings.push((levelYs[i]! - levelYs[i - 1]!) * mmPerUnit);

  // Storey candidates exclude any short top spacing (likely a parapet) when we
  // have more than one spacing to compare against.
  const fullSpacings = spacings.length > 1 ? spacings.slice(0, -1) : spacings;
  let storeyHeightMm = fullSpacings.length ? median(fullSpacings) : 0;

  // Detect a parapet: a short topmost level above the highest full storey.
  let parapetMm: number | undefined;
  if (spacings.length > 1) {
    const topSpacing = spacings[spacings.length - 1]!;
    if (storeyHeightMm > 0 && topSpacing < storeyHeightMm * 0.6) parapetMm = topSpacing;
  }

  // Refine against dimension annotations (feet-inches or plain mm → mm). Average
  // the geometric storey estimate with the median annotated height when present.
  const dims = input.texts
    .map((t) => parseHeightText(t.text))
    .filter((v): v is number => v != null && v > 0);
  if (dims.length) {
    const annotated = median(dims);
    storeyHeightMm = storeyHeightMm > 0 ? (storeyHeightMm + annotated) / 2 : annotated;
  }

  return { storeyHeightMm, levelYs, ...(parapetMm != null ? { parapetMm } : {}) };
}
