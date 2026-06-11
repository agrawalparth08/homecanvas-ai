/**
 * PDF floor-plan vector tracing helpers (local-only, no network).
 *
 * Extracts axis-aligned line segments from a CAD PDF in the SAME pixel space as
 * the rasterized underlay (pdfjs render at `scale`), clusters them into a
 * structural wall grid, and renders verification overlays with @napi-rs/canvas.
 *
 * Used to retrace the my-home scene against the real plans instead of eyeballed
 * rectangles. Calibration (mm-per-px) is derived separately from the plan's
 * dimension annotations; see scripts/trace/trace-lower.mjs.
 */
import { readFileSync } from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** All drawn line segments in PNG-pixel space (top-left origin), at `scale`. */
export async function extractSegments(pdfPath, scale = 2) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale });
  const ol = await page.getOperatorList();
  const fns = ol.fnArray, args = ol.argsArray;
  let ctm = vp.transform.slice();
  let stroke = '#000000';
  const stack = [];
  const segs = [];
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i], a = args[i];
    if (fn === OPS.save) stack.push({ ctm: ctm.slice(), stroke });
    else if (fn === OPS.restore) { const s = stack.pop(); ctm = s?.ctm ?? vp.transform.slice(); stroke = s?.stroke ?? '#000000'; }
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.setStrokeRGBColor) stroke = typeof a[0] === 'string' ? a[0] : '#000000';
    else if (fn === OPS.constructPath) {
      for (const fa of a[1]) {
        let cx = 0, cy = 0, st = false;
        for (let k = 0; k + 2 < fa.length; k += 3) {
          const op = fa[k], x = fa[k + 1], y = fa[k + 2];
          const [X, Y] = ap(ctm, x, y);
          if (op === 0 || !st) { cx = X; cy = Y; st = true; }
          else { segs.push([cx, cy, X, Y, stroke]); cx = X; cy = Y; }
        }
      }
    }
  }
  return { segs, width: Math.round(vp.width), height: Math.round(vp.height) };
}

/** Split into axis-aligned vertical/horizontal segments above a min length. */
export function axisSegments(segs, minLen = 15, tol = 1.5) {
  const v = [], h = [];
  for (const s of segs) {
    const dx = Math.abs(s[2] - s[0]), dy = Math.abs(s[3] - s[1]);
    const L = Math.hypot(dx, dy);
    if (L < minLen) continue;
    if (dx < tol) v.push({ coord: (s[0] + s[2]) / 2, lo: Math.min(s[1], s[3]), hi: Math.max(s[1], s[3]), len: L });
    else if (dy < tol) h.push({ coord: (s[1] + s[3]) / 2, lo: Math.min(s[0], s[2]), hi: Math.max(s[0], s[2]), len: L });
  }
  return { v, h };
}

/** Length-weighted 1-D clustering of line coordinates → structural grid lines. */
export function gridLines(lines, tol = 4, minTotalLen = 60) {
  const byCoord = new Map();
  for (const l of lines) {
    const c = Math.round(l.coord);
    byCoord.set(c, (byCoord.get(c) || 0) + l.len);
  }
  const coords = [...byCoord.keys()].sort((a, b) => a - b);
  const clusters = [];
  for (const c of coords) {
    const last = clusters[clusters.length - 1];
    if (last && c - last.max <= tol) { last.sum += byCoord.get(c) * c; last.w += byCoord.get(c); last.len += byCoord.get(c); last.max = c; }
    else clusters.push({ sum: byCoord.get(c) * c, w: byCoord.get(c), len: byCoord.get(c), max: c });
  }
  return clusters.filter((c) => c.len >= minTotalLen).map((c) => Math.round(c.sum / c.w)).sort((a, b) => a - b);
}
