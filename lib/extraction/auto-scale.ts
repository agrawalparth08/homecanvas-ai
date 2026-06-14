import { parseFeetInches } from '../geometry/scale';

/**
 * OCR'd dimension labels -> mm-per-pixel auto-scale.
 *
 * Scanned plans carry no calibration metadata, but dimension annotations
 * (12'-0", 3600, 3.6m) next to a measured pixel span give us real-world
 * scale for free. We parse each label to MILLIMETRES, divide by the pixel
 * span it labels, and take the MEDIAN across samples so a single mis-OCR'd
 * label (or a mislocated span) can't skew the result.
 */

/** A single dimension label paired with the pixel length it measures. */
export interface DimSample {
  text: string;
  pixels: number;
}

export interface AutoScaleResult {
  mmPerPx: number;
  /** how many samples actually parsed + contributed (pixels > 0). */
  samples: number;
}

// Metres: "3.6m", "3.6 m". Anchored so we don't pick metres out of "3600mm".
const METRES_RE = /^\s*(\d+(?:\.\d+)?)\s*m\s*$/i;
// Plain millimetres: a 3-5 digit run, optional "mm" suffix. Covers "3600",
// "3600mm". 3-5 digits keeps us in real-world mm ranges (100mm..99999mm).
const PLAIN_MM_RE = /^\s*(\d{3,5})\s*(?:mm)?\s*$/i;

/**
 * Parse a dimension label to millimetres. Tries feet-inches first (so a
 * leading number isn't grabbed by the plain-mm branch), then metres, then
 * plain mm. Returns null if nothing matches.
 */
export function parseDimensionMm(text: string): number | null {
  const ft = parseFeetInches(text);
  if (ft != null) return ft;

  const m = text.match(METRES_RE);
  if (m && m[1] != null) return Number(m[1]) * 1000;

  const mm = text.match(PLAIN_MM_RE);
  if (mm && mm[1] != null) return Number(mm[1]);

  return null;
}

/** Median of a non-empty numeric array. Caller guarantees length >= 1. */
function median(values: number[]): number {
  // sort a copy so we don't mutate the caller's array.
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) {
    // odd length: exact middle element exists.
    return sorted[mid]!;
  }
  // even length: average the two central elements (both in-bounds).
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Derive mm-per-pixel from a set of dimension labels. Each sample's text is
 * parsed to mm and divided by its pixel span; the MEDIAN per-sample ratio is
 * returned. Samples whose text doesn't parse, or whose pixel span is <= 0,
 * are dropped. Returns null if nothing usable remains.
 */
export function mmPerPxFromDimensions(samples: DimSample[]): AutoScaleResult | null {
  const ratios: number[] = [];
  for (const s of samples) {
    if (s.pixels <= 0) continue; // can't divide by a non-positive span.
    const mm = parseDimensionMm(s.text);
    if (mm == null) continue;
    ratios.push(mm / s.pixels);
  }
  if (ratios.length === 0) return null;
  return { mmPerPx: median(ratios), samples: ratios.length };
}
