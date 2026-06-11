/** Crop a PNG into overlapping 2x-upscaled tiles for legible reading.
 *   node scripts/trace/crop.mjs <in.png> <outPrefix> [cols] [rows] [overlap]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const [, , inPath, prefix, colsS = '2', rowsS = '3', ovS = '40'] = process.argv;
const cols = +colsS, rows = +rowsS, ov = +ovS, S = 2;
const img = await loadImage(readFileSync(inPath));
const W = img.width, H = img.height;
const tw = Math.ceil(W / cols), th = Math.ceil(H / rows);
for (let r = 0; r < rows; r++) {
  for (let cc = 0; cc < cols; cc++) {
    const sx = Math.max(0, cc * tw - ov), sy = Math.max(0, r * th - ov);
    const ex = Math.min(W, (cc + 1) * tw + ov), ey = Math.min(H, (r + 1) * th + ov);
    const w = ex - sx, h = ey - sy;
    const cv = createCanvas(w * S, h * S);
    const c = cv.getContext('2d');
    c.drawImage(img, sx, sy, w, h, 0, 0, w * S, h * S);
    const out = `${prefix}-r${r}c${cc}.png`;
    writeFileSync(out, cv.toBuffer('image/png'));
    console.log(`${out}  covers x[${sx}..${ex}] y[${sy}..${ey}]`);
  }
}
