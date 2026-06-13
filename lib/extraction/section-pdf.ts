/**
 * PDF section/elevation segments -> SectionHeightsInput (Path Z plumbing).
 *
 * The runtime pipeline turns a pdfjs operatorList into coloured line SEGMENTS
 * ({x0,y0,x1,y1,...}) upstream; section-heights.ts then clusters horizontal
 * LEVEL lines into storey heights. This is the pure step between: pick the
 * near-horizontal segments as level lines and pass text items through, yielding
 * the SectionHeightsInput the parser expects. Inputs are trusted upstream shapes
 * (no zod). Deterministic: same input -> same output.
 */
import type { SectionHeightsInput, SectionText, SectionHLine } from './section-heights';

/** A raw stroke segment from upstream vectorization (colour irrelevant here). */
export interface RawSeg { x0: number; y0: number; x1: number; y1: number; }
/** A raw PDF text item (pdfjs textContent flavour: `str` + position). */
export interface RawText { str: string; x: number; y: number; }
export interface SectionPdfOptions {
  /** |y1-y0| <= this counts as horizontal (drawing units). */
  horizTol?: number;
  /** Minimum horizontal span to keep (drops tick marks / dimension stubs). */
  minLen?: number;
}

/**
 * Select near-horizontal segments as section level lines and map text items into
 * the SectionHeightsInput the section-height parser consumes.
 *
 * A segment is a level line when its vertical drift |y1-y0| <= horizTol AND its
 * horizontal span |x1-x0| >= minLen, screening out diagonals (e.g. roof/stair
 * slopes) and short ticks. Each kept segment emits a SectionHLine with the mean y
 * (drift midpoint) and ordered x extent. Text is passed through 1:1, dropping
 * empty/whitespace strings that carry no annotation.
 */
export function sectionInputFromSegments(
  segs: RawSeg[],
  texts: RawText[],
  opts: SectionPdfOptions = {},
): SectionHeightsInput {
  const horizTol = opts.horizTol ?? 1.5;
  const minLen = opts.minLen ?? 20;

  const hLines: SectionHLine[] = [];
  for (const s of segs) {
    if (Math.abs(s.y1 - s.y0) > horizTol) continue; // diagonal / vertical
    if (Math.abs(s.x1 - s.x0) < minLen) continue; // too short to be a level
    hLines.push({
      y: (s.y0 + s.y1) / 2,
      x0: Math.min(s.x0, s.x1),
      x1: Math.max(s.x0, s.x1),
    });
  }

  const sectionTexts: SectionText[] = [];
  for (const t of texts) {
    if (t.str.trim() === '') continue; // empty/whitespace carries no annotation
    sectionTexts.push({ text: t.str, x: t.x, y: t.y });
  }

  return { texts: sectionTexts, hLines };
}
