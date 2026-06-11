/** Preview the wizard view: scene walls (thin) + openings over the plan underlay.
 *   node scripts/trace/render-scene-overlay.mjs <floorId> <underlay.png> <out.png>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const [, , floorId, pngPath, outPath] = process.argv;
const scene = JSON.parse(readFileSync('private-home-inputs/processed/scene-json/my-home.scene.json', 'utf8'));
const floor = scene.floors.find((f) => f.id === floorId);
const cal = floor.calibration; // { mmPerPx, originPx }
const toPx = (m) => ({ x: m.x / cal.mmPerPx + cal.originPx.x, y: cal.originPx.y - m.y / cal.mmPerPx });

const img = await loadImage(readFileSync(pngPath));
const W = img.width, H = img.height;
const cv = createCanvas(W, H);
const c = cv.getContext('2d');
c.drawImage(img, 0, 0, W, H);
c.globalAlpha = 0.35; c.fillStyle = '#1a1f2b'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; // dim like the wizard

// walls — thin cyan centerlines
c.strokeStyle = '#3ec7ff'; c.lineWidth = 2; c.lineCap = 'round'; c.globalAlpha = 0.9;
for (const w of floor.walls) {
  const a = toPx(w.path.pts[0]), b = toPx(w.path.pts[w.path.pts.length - 1]);
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}
c.globalAlpha = 1;
// openings — small dots
for (const o of floor.openings) {
  const w = floor.walls.find((x) => x.id === o.wallId); if (!w) continue;
  const a = w.path.pts[0], b = w.path.pts[w.path.pts.length - 1];
  const m = toPx({ x: a.x + (b.x - a.x) * o.u, y: a.y + (b.y - a.y) * o.u });
  c.beginPath(); c.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
  c.fillStyle = o.kind === 'window' ? '#5bc0ff' : '#ffd27a'; c.fill();
}
// room labels
c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
for (const r of floor.rooms) {
  const xs = r.boundary.outer.map((p) => p.x), ys = r.boundary.outer.map((p) => p.y);
  const ctr = toPx({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
  const t = r.name;
  const tw = c.measureText(t).width;
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(ctr.x - tw / 2 - 3, ctr.y - 8, tw + 6, 16);
  c.fillStyle = '#e8eef7'; c.fillText(t, ctr.x, ctr.y);
}
writeFileSync(outPath, cv.toBuffer('image/png'));
console.log('wrote', outPath, `${W}x${H} |`, floor.rooms.length, 'rooms', floor.walls.length, 'walls');
