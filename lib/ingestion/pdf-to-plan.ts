/**
 * Vector-PDF segments + text -> 'vector-pdf' PrimitivePlan (no-CAD front door).
 *
 * Most floor-plan PDFs are VECTOR (drawn lines ≈ CAD). `pdf-operator-segments.ts`
 * already turns a pdfjs operatorList into coloured line SEGMENTS; this is the
 * missing PURE step: turn those segments + text items into a schema-valid
 * PrimitivePlan that feeds the same `buildSceneFromPrimitives` spine the CAD path
 * uses. We deliberately emit EVERY wall-like segment as a wall a→b and do NOT
 * detect rooms here — the spine's `detectRooms*` does that, and `collapseDoubleWalls`
 * downstream merges the double-line walls a vector plan typically draws.
 *
 * PURE: no pdfjs import (segments come in as plain data), no DOM/fs/network, and
 * fully deterministic — output is always run through `parsePrimitivePlan` so it is
 * schema-valid by construction.
 */
import { parsePrimitivePlan, type PrimitivePlan } from '../extraction/primitive-plan';

/** A vector stroke segment (the {x0,y0,x1,y1,color} shape `pdf-operator-segments` emits). */
export interface PdfSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color?: string;
}

/** A PDF text item (pdfjs textContent flavour: `str` + position). */
export interface PdfText {
  str: string;
  x: number;
  y: number;
}

export interface PdfToPlanOptions {
  /** mm per PDF unit (from calibration/OCR); default 1. */
  unitsToMm?: number;
  /** drop segments shorter than this (drawing units) as noise/ticks; default ~15. */
  minLenPx?: number;
}

/** Euclidean length of a segment. */
function segLen(s: PdfSeg): number {
  return Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
}

/**
 * Build a 'vector-pdf' PrimitivePlan from vector PDF segments + text.
 *
 * Keeps segments with length >= `minLenPx` (screening sub-tick noise) and emits
 * each surviving segment as a free wall a→b. Maps every non-blank text item to a
 * label. The object is parsed through `parsePrimitivePlan`, so the result is always
 * schema-valid (and any malformed numeric input would throw there, not produce a
 * bad scene).
 */
export function primitivePlanFromPdfSegments(
  segs: PdfSeg[],
  texts: PdfText[],
  opts: PdfToPlanOptions = {},
): PrimitivePlan {
  const unitsToMm = opts.unitsToMm ?? 1;
  const minLenPx = opts.minLenPx ?? 15;

  // walls: every wall-like segment a→b; collapseDoubleWalls handles double lines downstream.
  const walls = segs
    .filter((s) => segLen(s) >= minLenPx)
    .map((s) => ({
      a: { x: s.x0, y: s.y0 },
      b: { x: s.x1, y: s.y1 },
      // only set `layer` when a colour bucket exists (exactOptionalPropertyTypes: never pass undefined).
      ...(s.color != null ? { layer: s.color } : {}),
    }));

  // labels: non-blank text only (whitespace-only carries no annotation).
  const labels = texts
    .filter((t) => t.str.trim() !== '')
    .map((t) => ({ text: t.str, x: t.x, y: t.y }));

  return parsePrimitivePlan({
    source: 'vector-pdf',
    unitsToMm,
    walls,
    labels,
  });
}
