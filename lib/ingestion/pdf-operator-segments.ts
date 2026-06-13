/**
 * pdfjs operator list -> coloured stroke segments (Phase 0, Path B loader).
 *
 * Walks a single PDF page's operator list, tracking the current transform
 * matrix (CTM) across save/restore/transform and the current stroke colour via
 * setStrokeRGBColor, and emits every drawn line segment from constructPath in
 * the CTM's output space as {x0,y0,x1,y1,color} — the exact `ColorSegment`
 * shape `pdf-vector.ts` consumes. This is the runtime equivalent of the
 * reference CTM-walk in scripts/trace/lib.mjs `extractSegments`.
 *
 * PURE: the pdfjs `OPS` enum is passed IN (no pdfjs import here), so the core
 * is unit-testable with a hand-built operator list and a tiny `OPS` stub.
 */
import type { ColorSegment } from '../extraction/color-features';

/** Minimal shape of a pdfjs operator list (page.getOperatorList()). */
export interface OperatorList {
  /** opcode per operation (indices into `OPS`). */
  fnArray: number[];
  /** argument tuple per operation (positionally aligned with `fnArray`). */
  argsArray: unknown[];
}

/** The pdfjs `OPS` enum (opcode name -> numeric id); only a few keys are used. */
export type Ops = Record<string, number>;

/** Options for the operator-list walk. */
export interface OperatorSegmentsOpts {
  /**
   * Optional pre-multiplied base transform applied before any page ops, e.g. a
   * viewport `transform` (`page.getViewport({ scale }).transform`) so segments
   * land in the rasterized underlay's pixel space. Defaults to identity.
   */
  scale?: number;
}

/** A 2x3 affine transform [a, b, c, d, e, f] (pdfjs/CSS matrix order). */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Compose two affine matrices (apply `b`, then `a` — i.e. `a` is the parent CTM). */
function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Map a point (x, y) through an affine matrix. */
function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Clamp a number to 0-255 and format as a two-digit hex byte. */
function hexByte(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

/** Coerce one setStrokeRGBColor argument tuple to a `#rrggbb` string, or null. */
function strokeArgsToHex(args: unknown): string | null {
  // legacy pdfjs hands back a ready hex string: ['#rrggbb'].
  if (Array.isArray(args) && typeof args[0] === 'string') {
    const s = args[0].trim();
    return /^#?[0-9a-f]{6}$/i.test(s) ? (s.startsWith('#') ? s.toLowerCase() : `#${s.toLowerCase()}`) : null;
  }
  // standard pdfjs hands back numeric channels: [r, g, b] (0-255).
  if (Array.isArray(args) && args.length >= 3 && args.slice(0, 3).every((n) => typeof n === 'number')) {
    return `#${hexByte(args[0] as number)}${hexByte(args[1] as number)}${hexByte(args[2] as number)}`;
  }
  return null;
}

/** Coerce a transform op's args to a 6-number matrix, or null if malformed. */
function transformArgsToMatrix(args: unknown): Matrix | null {
  if (Array.isArray(args) && args.length >= 6 && args.slice(0, 6).every((n) => typeof n === 'number')) {
    return [args[0], args[1], args[2], args[3], args[4], args[5]] as Matrix;
  }
  return null;
}

/**
 * Pull the flat [op, x, y, op, x, y, ...] subpath arrays out of a constructPath
 * argument tuple. pdfjs passes `[opsArray, coordsArray]`; the reference walk
 * treats `argsArray[i][1]` as an array of flat triple-encoded subpaths.
 */
function constructPathSubpaths(args: unknown): number[][] {
  if (!Array.isArray(args)) return [];
  const subpaths = args[1];
  if (!Array.isArray(subpaths)) return [];
  return subpaths.filter((s): s is number[] => Array.isArray(s) && s.every((n) => typeof n === 'number'));
}

/**
 * Walk a pdfjs operator list into coloured line segments in CTM output space.
 *
 * Tracks the CTM across `OPS.save`/`OPS.restore`/`OPS.transform`, the current
 * stroke colour across `OPS.setStrokeRGBColor`, and emits one segment per
 * `lineTo` inside every `OPS.constructPath` (moveTo / subpath start only moves
 * the pen). `OPS` is supplied by the caller so this stays pdfjs-free and pure.
 *
 * @param opList page operator list ({ fnArray, argsArray }).
 * @param OPS    the pdfjs `OPS` opcode enum.
 * @param opts   optional base transform (`scale`).
 */
export function operatorListToColorSegments(
  opList: OperatorList,
  OPS: Ops,
  opts: OperatorSegmentsOpts = {},
): ColorSegment[] {
  const base: Matrix = opts.scale != null ? [opts.scale, 0, 0, opts.scale, 0, 0] : [...IDENTITY];

  const { fnArray, argsArray } = opList;
  const n = Math.min(fnArray.length, argsArray.length);

  let ctm: Matrix = base;
  let stroke = '#000000';
  const stack: Array<{ ctm: Matrix; stroke: string }> = [];
  const segs: ColorSegment[] = [];

  for (let i = 0; i < n; i++) {
    const fn = fnArray[i];
    const a = argsArray[i];

    if (fn === OPS.save) {
      stack.push({ ctm, stroke });
    } else if (fn === OPS.restore) {
      const s = stack.pop();
      ctm = s ? s.ctm : base;
      stroke = s ? s.stroke : '#000000';
    } else if (fn === OPS.transform) {
      const m = transformArgsToMatrix(a);
      if (m) ctm = mul(ctm, m);
    } else if (fn === OPS.setStrokeRGBColor) {
      const hex = strokeArgsToHex(a);
      if (hex) stroke = hex;
    } else if (fn === OPS.constructPath) {
      for (const sub of constructPathSubpaths(a)) {
        let cx = 0;
        let cy = 0;
        let started = false;
        for (let k = 0; k + 2 < sub.length; k += 3) {
          const op = sub[k]!;
          const [X, Y] = apply(ctm, sub[k + 1]!, sub[k + 2]!);
          // op === 0 is moveTo / subpath start: it only repositions the pen.
          if (op === 0 || !started) {
            cx = X;
            cy = Y;
            started = true;
          } else {
            segs.push({ x0: cx, y0: cy, x1: X, y1: Y, color: stroke });
            cx = X;
            cy = Y;
          }
        }
      }
    }
  }

  return segs;
}
