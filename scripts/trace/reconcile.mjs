/** Merge N independent tracer outputs into a grid-snapped consensus room list.
 *   node scripts/trace/reconcile.mjs <tracers.json> <out-consensus.json>
 * tracers.json: { tracers: [ [room,...], [room,...], ... ] }
 * Matches rooms across tracers by spatial overlap (labels collide), takes the
 * median of each edge, snaps to the nearest structural grid line, and reports
 * disagreements for manual review.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GRID_X = '5 132 203 244 261 280 300 312 329 358 368 380 399 417 430 447 464 476 485 502 516 522 540 559 569 575 583 596 610 647 669 690 725 735 741 752 776 786 828 838 865 993'.split(' ').map(Number);
const GRID_Y = '5 82 103 121 139 166 178 188 237 262 271 296 321 338 345 376 387 416 429 496 520 526 542 611 619 671 707 756 762 771 803 813 828 862 907 945 992 1019 1036 1075 1157 1217 1225 1245 1307 1315 1322 1381 1413'.split(' ').map(Number);
const snap = (v, grid) => grid.reduce((b, g) => (Math.abs(g - v) < Math.abs(b - v) ? g : b), grid[0]);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const norm = (r) => ({ ...r, x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1), y0: Math.min(r.y0, r.y1), y1: Math.max(r.y0, r.y1) });
const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy; return inter / (area(a) + area(b) - inter || 1);
};
const mode = (arr) => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1])[0][0]; };

const [, , inPath, outPath] = process.argv;
const { tracers } = JSON.parse(readFileSync(inPath, 'utf8'));
const all = [];
tracers.forEach((list, ti) => (list || []).forEach((r) => all.push({ ...norm(r), ti })));

// greedy grouping by IoU
const used = new Set();
const groups = [];
for (let i = 0; i < all.length; i++) {
  if (used.has(i)) continue;
  const g = [all[i]]; used.add(i);
  for (let j = i + 1; j < all.length; j++) {
    if (used.has(j) || all[j].ti === all[i].ti) continue;
    if (iou(all[i], all[j]) > 0.3) { g.push(all[j]); used.add(j); }
  }
  groups.push(g);
}

const consensus = [];
const report = [];
for (const g of groups) {
  const x0 = snap(med(g.map((r) => r.x0)), GRID_X);
  const x1 = snap(med(g.map((r) => r.x1)), GRID_X);
  const y0 = snap(med(g.map((r) => r.y0)), GRID_Y);
  const y1 = snap(med(g.map((r) => r.y1)), GRID_Y);
  const label = mode(g.map((r) => r.label));
  const kind = mode(g.map((r) => r.kind));
  const isVoid = g.filter((r) => r.isVoid).length > g.length / 2;
  const openToSky = g.filter((r) => r.openToSky).length > g.length / 2;
  const spread = Math.max(...['x0', 'x1', 'y0', 'y1'].map((k) => Math.max(...g.map((r) => r[k])) - Math.min(...g.map((r) => r[k]))));
  consensus.push({ label, kind, x0, y0, x1, y1, isVoid, openToSky, n: g.length, spread });
  if (g.length < tracers.length || spread > 30) report.push(`  ${g.length}/${tracers.length} agree · spread ${spread}px · ${label} [${kind}] -> x[${x0}..${x1}] y[${y0}..${y1}]  (tracers: ${g.map((r) => r.ti).join(',')})`);
}
consensus.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
writeFileSync(outPath, JSON.stringify(consensus, null, 2));
console.log(`groups: ${groups.length} | consensus rooms: ${consensus.length}`);
console.log('\nNEEDS REVIEW (partial agreement or >30px edge spread):');
console.log(report.length ? report.join('\n') : '  (none — all rooms agreed within tolerance)');
console.log('\nALL CONSENSUS ROOMS:');
for (const r of consensus) console.log(`  ${r.label.padEnd(18)} ${r.kind.padEnd(13)} x[${r.x0}..${r.x1}] y[${r.y0}..${r.y1}]${r.isVoid ? ' VOID' : ''}${r.openToSky ? ' SKY' : ''}  (${r.n}/${tracers.length})`);
