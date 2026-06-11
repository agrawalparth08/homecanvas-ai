/** Draw traced room rectangles over the plan underlay for visual verification.
 *   node scripts/trace/render-rooms.mjs <underlay.png> <rooms.json> <out.png>
 * rooms.json: [{label,x0,y0,x1,y1,isVoid?,openToSky?}]  (px, image space, y down)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const [, , pngPath, roomsPath, outPath] = process.argv;
const img = await loadImage(readFileSync(pngPath));
const W = img.width, H = img.height;
const rooms = JSON.parse(readFileSync(roomsPath, 'utf8'));

const cv = createCanvas(W, H);
const c = cv.getContext('2d');
c.drawImage(img, 0, 0, W, H);

const palette = ['#e6194B','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#bfef45','#fabed4','#469990','#dcbeff','#9A6324','#800000','#808000','#000075','#a9a9a9'];
c.lineWidth = 2.5;
c.textBaseline = 'middle';
rooms.forEach((r, i) => {
  const col = r.isVoid ? '#ff0000' : palette[i % palette.length];
  const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
  const w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
  c.globalAlpha = r.isVoid ? 0.10 : 0.18;
  c.fillStyle = col; c.fillRect(x, y, w, h);
  c.globalAlpha = 1;
  c.strokeStyle = col;
  if (r.isVoid) c.setLineDash([7, 5]); else c.setLineDash([]);
  c.strokeRect(x, y, w, h);
  // label
  const cx = x + w / 2, cy = y + h / 2;
  c.font = 'bold 12px sans-serif';
  const txt = `${r.label}${r.isVoid ? ' (void)' : ''}`;
  const tw = c.measureText(txt).width;
  c.globalAlpha = 0.82; c.fillStyle = '#000'; c.fillRect(cx - tw / 2 - 3, cy - 9, tw + 6, 18);
  c.globalAlpha = 1; c.fillStyle = col; c.fillText(txt, cx - tw / 2, cy + 1);
});
c.setLineDash([]);
writeFileSync(outPath, cv.toBuffer('image/png'));
console.log('wrote', outPath, `${W}x${H}`, '|', rooms.length, 'rooms');
