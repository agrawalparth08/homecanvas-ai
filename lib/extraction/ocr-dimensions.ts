import { parseDimensionMm, type DimSample } from './auto-scale';

/**
 * OCR dimension labels -> measured-span association.
 *
 * `auto-scale.ts` turns {text, pixels} samples into mm/px, but it needs those
 * samples produced first. A dimension label on a raster plan ("3600", 12'-0")
 * annotates a specific drawn line; the line's pixel length IS the measured span
 * for that label. We pair each dimension-looking OCR word with the nearest
 * detected line segment (by perpendicular distance from the word centre to the
 * segment, clamped to the endpoints) and emit the segment's Euclidean length as
 * the `pixels` value `mmPerPxFromDimensions` consumes.
 *
 * parseDimensionMm is reused as the inclusion gate AND as the parser downstream,
 * so what counts as a dimension here is exactly what auto-scale will accept.
 */

/** An OCR'd word: centre + box size, all in pixels. */
export interface OcrWord {
  text: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** A detected line segment in pixel space (the thing a dimension labels). */
export interface DimLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DimAssocOptions {
  /** Max word-centre-to-line distance to count as "annotates this line", px. */
  maxDistPx?: number;
}

const DEFAULT_MAX_DIST_PX = 60;

/**
 * Perpendicular distance from point (px,py) to segment (x0,y0)-(x1,y1),
 * clamped so a point beyond an endpoint measures to that endpoint (not to the
 * infinite line). Degenerate segments (zero length) reduce to point-to-point.
 */
function pointSegmentDist(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  // Degenerate segment: both endpoints coincide -> distance to that point.
  if (lenSq === 0) return Math.hypot(px - x0, py - y0);
  // Projection parameter t of the point onto the line, clamped to [0,1] so we
  // stay on the segment rather than its infinite extension.
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = x0 + t * dx;
  const projY = y0 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Euclidean length of a segment, in px — the measured span for its label. */
function segmentLength(line: DimLine): number {
  return Math.hypot(line.x1 - line.x0, line.y1 - line.y0);
}

/**
 * For each word whose text parses as a dimension, find the nearest line within
 * `maxDistPx` and emit {text, pixels: that line's length}. Words that aren't
 * dimensions, or have no line in range, are skipped. Output preserves input
 * word order (deterministic; no random/time use). Ties on distance keep the
 * first line in input order (strict `<` comparison).
 */
export function dimensionSamples(
  words: OcrWord[],
  lines: DimLine[],
  opts?: DimAssocOptions,
): DimSample[] {
  const maxDist = opts?.maxDistPx ?? DEFAULT_MAX_DIST_PX;
  const out: DimSample[] = [];

  for (const word of words) {
    // Inclusion gate: must read as a real dimension for auto-scale to use it.
    if (parseDimensionMm(word.text) == null) continue;

    let bestDist = Infinity;
    let bestLine: DimLine | null = null;
    for (const line of lines) {
      const d = pointSegmentDist(word.cx, word.cy, line.x0, line.y0, line.x1, line.y1);
      if (d < bestDist) {
        bestDist = d;
        bestLine = line;
      }
    }

    // No line, or nearest line is too far to plausibly be the annotated span.
    if (bestLine == null || bestDist > maxDist) continue;

    const pixels = segmentLength(bestLine);
    if (pixels <= 0) continue; // a zero-length span carries no scale info.
    out.push({ text: word.text, pixels });
  }

  return out;
}
