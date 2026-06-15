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

/** DrawOPS opcodes in a pdfjs 6 constructPath path buffer. */
const D_MOVE = 0;
const D_LINE = 1;
const D_CURVE = 2; // cubic: 6 floats (2 control points + endpoint)
const D_QUAD = 3; // quadratic: 4 floats (1 control point + endpoint)
const D_CLOSE = 4; // 0 floats

/**
 * Extract the path buffer(s) from a constructPath arg tuple. pdfjs 6 passes
 * `[fn, [Float32Array], minMax]`, where the Float32Array is a variable-stride
 * DrawOPS stream (NOT the old flat [op,x,y] triples — the previous `Array.isArray`
 * check silently dropped the typed array, so every real PDF yielded 0 segments).
 * We accept a typed array OR a plain number[] (test fixtures) and tolerate
 * multiple buffers in the container.
 */
function constructPathBuffers(args: unknown): ArrayLike<number>[] {
  if (!Array.isArray(args)) return [];
  const container = args[1];
  if (container instanceof Float32Array) return [container];
  if (Array.isArray(container)) {
    return container.filter(
      (b): b is ArrayLike<number> =>
        b instanceof Float32Array || (Array.isArray(b) && b.every((n) => typeof n === 'number')),
    );
  }
  return [];
}

/**
 * Walk one DrawOPS stream, emitting a straight segment per lineTo, per curve
 * (chord-flattened to its endpoint — floor plans are straight-walled), and per
 * closePath. moveTo only repositions the pen + records the subpath start.
 * Stride: moveTo/lineTo +2 floats, curveTo +6, quadraticCurveTo +4, closePath +0.
 */
function pushPathSegments(buf: ArrayLike<number>, ctm: Matrix, stroke: string, segs: ColorSegment[]): void {
  let cx = 0;
  let cy = 0; // pen, output space
  let sx = 0;
  let sy = 0; // subpath start, output space
  const n = buf.length;
  let k = 0;
  while (k < n) {
    const code = buf[k]!;
    if (code === D_MOVE) {
      if (k + 2 >= n) break;
      [cx, cy] = apply(ctm, buf[k + 1]!, buf[k + 2]!);
      sx = cx;
      sy = cy;
      k += 3;
    } else if (code === D_LINE) {
      if (k + 2 >= n) break;
      const [X, Y] = apply(ctm, buf[k + 1]!, buf[k + 2]!);
      segs.push({ x0: cx, y0: cy, x1: X, y1: Y, color: stroke });
      cx = X;
      cy = Y;
      k += 3;
    } else if (code === D_CURVE) {
      if (k + 6 >= n) break;
      const [X, Y] = apply(ctm, buf[k + 5]!, buf[k + 6]!);
      segs.push({ x0: cx, y0: cy, x1: X, y1: Y, color: stroke });
      cx = X;
      cy = Y;
      k += 7;
    } else if (code === D_QUAD) {
      if (k + 4 >= n) break;
      const [X, Y] = apply(ctm, buf[k + 3]!, buf[k + 4]!);
      segs.push({ x0: cx, y0: cy, x1: X, y1: Y, color: stroke });
      cx = X;
      cy = Y;
      k += 5;
    } else if (code === D_CLOSE) {
      if (cx !== sx || cy !== sy) segs.push({ x0: cx, y0: cy, x1: sx, y1: sy, color: stroke });
      cx = sx;
      cy = sy;
      k += 1;
    } else {
      break; // unknown opcode -> bail rather than desync the stride
    }
  }
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
      for (const buf of constructPathBuffers(a)) pushPathSegments(buf, ctm, stroke, segs);
    }
  }

  return segs;
}
