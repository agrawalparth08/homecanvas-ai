/** Snap traced room-rect edges onto the real black wall lines from the plan PDF.
 *   node scripts/trace/snap-to-walls.mjs <rooms.json> <plan.pdf>
 * Black '#000000' axis segments are the house walls; the red sheet border and
 * coloured furniture are ignored. Each x-edge snaps to the nearest black
 * vertical line, each y-edge to the nearest black horizontal — shared edges
 * (identical coords) snap together, so walls stay joined.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extractSegments, axisSegments, gridLines } from './lib.mjs';

const [, , jsonPath, pdfPath] = process.argv;
const TOL = 34; // px (~560mm): catch the eyeballed offset without grabbing the wrong wall
const MIN = 45; // px: don't let a room collapse

const { segs } = await extractSegments(pdfPath, 2);
const black = segs.filter((s) => s[4] === '#000000');
const { v, h } = axisSegments(black, 22);
const X = gridLines(v, 5, 45);
const Y = gridLines(h, 5, 45);

const snap = (val, lines) => {
  let best = val, bd = TOL;
  for (const g of lines) { const d = Math.abs(g - val); if (d < bd) { bd = d; best = g; } }
  return best;
};

const rooms = JSON.parse(readFileSync(jsonPath, 'utf8'));
let moved = 0;
for (const r of rooms) {
  const nx0 = snap(r.x0, X), nx1 = snap(r.x1, X);
  const ny0 = snap(r.y0, Y), ny1 = snap(r.y1, Y);
  if (Math.abs(nx1 - nx0) >= MIN && (nx0 !== r.x0 || nx1 !== r.x1)) { moved += (nx0 !== r.x0) + (nx1 !== r.x1); r.x0 = nx0; r.x1 = nx1; }
  if (Math.abs(ny1 - ny0) >= MIN && (ny0 !== r.y0 || ny1 !== r.y1)) { moved += (ny0 !== r.y0) + (ny1 !== r.y1); r.y0 = ny0; r.y1 = ny1; }
}
// Merge near-coincident edges across rooms so a tiny gap doesn't become a
// degenerate sliver wall (collapse anything within ~8px to one shared value).
const quant = (vals, tol) => {
  const sorted = [...new Set(vals)].sort((a, b) => a - b);
  const map = new Map();
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] - sorted[i] <= tol) j++;
    const rep = Math.round(sorted.slice(i, j + 1).reduce((s, v) => s + v, 0) / (j - i + 1));
    for (let k = i; k <= j; k++) map.set(sorted[k], rep);
    i = j + 1;
  }
  return map;
};
const mapX = quant(rooms.flatMap((r) => [r.x0, r.x1]), 8);
const mapY = quant(rooms.flatMap((r) => [r.y0, r.y1]), 8);
for (const r of rooms) { r.x0 = mapX.get(r.x0); r.x1 = mapX.get(r.x1); r.y0 = mapY.get(r.y0); r.y1 = mapY.get(r.y1); }

writeFileSync(jsonPath, JSON.stringify(rooms, null, 2) + '\n');
console.log(`${jsonPath}: ${rooms.length} rooms, ${moved} edges snapped | X lines ${X.length}, Y lines ${Y.length}`);
console.log('  X:', X.join(' '));
console.log('  Y:', Y.join(' '));
