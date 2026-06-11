/** Extract plan features by stroke colour and write them as mm-space JSON the
 * scene generator consumes:
 *   - ORANGE (#ff7f00) axis segments = WINDOWS (the gap in the black wall sized
 *     by the orange marking) -> clustered into one window per opening.
 *   - MAGENTA (#ff00ff) = structural PILLARS (cannot be removed) -> merged into
 *     small rectangles.
 *   node scripts/trace/extract-features.mjs <plan.pdf> <out.json>
 * Calibration matches loadTracedFloor: mm = (px - originX)*S , y flipped.
 */
import { writeFileSync } from 'node:fs';
import { extractSegments } from './lib.mjs';

const S = 16.47, OX = 130, BY = 1330;
const mmX = (px) => Math.round((px - OX) * S);
const mmY = (py) => Math.round((BY - py) * S);

const [, , pdfPath, outPath] = process.argv;
const { segs } = await extractSegments(pdfPath, 2);

// ---- windows: orange axis segments, clustered per opening --------------------
const orange = [];
for (const s of segs) {
  if (s[4] !== '#ff7f00') continue;
  const dx = Math.abs(s[2] - s[0]), dy = Math.abs(s[3] - s[1]);
  if (dx < 2 && dy > 6) orange.push({ o: 'v', coord: (s[0] + s[2]) / 2, lo: Math.min(s[1], s[3]), hi: Math.max(s[1], s[3]) });
  else if (dy < 2 && dx > 6) orange.push({ o: 'h', coord: (s[1] + s[3]) / 2, lo: Math.min(s[0], s[2]), hi: Math.max(s[0], s[2]) });
}
const used = new Array(orange.length).fill(false);
const windows = [];
for (let i = 0; i < orange.length; i++) {
  if (used[i]) continue;
  let { o, coord, lo, hi } = orange[i]; used[i] = true;
  let csum = coord, cn = 1, changed = true;
  while (changed) {
    changed = false;
    for (let j = 0; j < orange.length; j++) {
      if (used[j] || orange[j].o !== o) continue;
      const a = orange[j];
      if (Math.abs(a.coord - csum / cn) <= 24 && a.hi >= lo - 12 && a.lo <= hi + 12) {
        used[j] = true; lo = Math.min(lo, a.lo); hi = Math.max(hi, a.hi); csum += a.coord; cn++; changed = true;
      }
    }
  }
  const lenPx = hi - lo;
  if (lenPx < 12) continue; // too short to be a window
  const coordPx = csum / cn;
  // to mm: 'v' => constant x, spans y; 'h' => constant y, spans x
  const w = o === 'v'
    ? { orient: 'v', coord: mmX(coordPx), lo: mmY(hi), hi: mmY(lo), width: Math.round(lenPx * S) }
    : { orient: 'h', coord: mmY(coordPx), lo: mmX(lo), hi: mmX(hi), width: Math.round(lenPx * S) };
  windows.push(w);
}

// ---- pillars: magenta segments merged into small rectangles ------------------
const pinkBoxes = [];
for (const s of segs) {
  if (s[4] !== '#ff00ff') continue;
  pinkBoxes.push({ x0: Math.min(s[0], s[2]), y0: Math.min(s[1], s[3]), x1: Math.max(s[0], s[2]), y1: Math.max(s[1], s[3]) });
}
const near = (a, b) => a.x0 <= b.x1 + 18 && b.x0 <= a.x1 + 18 && a.y0 <= b.y1 + 18 && b.y0 <= a.y1 + 18;
const pused = new Array(pinkBoxes.length).fill(false);
const pillars = [];
for (let i = 0; i < pinkBoxes.length; i++) {
  if (pused[i]) continue;
  const g = { ...pinkBoxes[i] }; pused[i] = true; let changed = true;
  while (changed) {
    changed = false;
    for (let j = 0; j < pinkBoxes.length; j++) {
      if (pused[j]) continue;
      const b = pinkBoxes[j];
      if (near(g, b)) { g.x0 = Math.min(g.x0, b.x0); g.y0 = Math.min(g.y0, b.y0); g.x1 = Math.max(g.x1, b.x1); g.y1 = Math.max(g.y1, b.y1); pused[j] = true; changed = true; }
    }
  }
  const wPx = g.x1 - g.x0, hPx = g.y1 - g.y0;
  if (wPx < 6 || hPx < 6 || wPx > 90 || hPx > 90) continue; // pillar-sized only
  pillars.push({ x0: mmX(g.x0), y0: mmY(g.y1), x1: mmX(g.x1), y1: mmY(g.y0) });
}

writeFileSync(outPath, JSON.stringify({ windows, pillars }, null, 2) + '\n');
console.log(`${outPath}: ${windows.length} windows, ${pillars.length} pillars`);
