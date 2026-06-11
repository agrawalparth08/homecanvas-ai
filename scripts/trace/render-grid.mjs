/**
 * Render the plan underlay with its extracted structural wall grid + pixel
 * rulers, so room boundaries can be read off exact grid coordinates.
 *   node scripts/trace/render-grid.mjs <underlay.png> <plan.pdf> <out.png>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { extractSegments, axisSegments, gridLines } from './lib.mjs';

const [, , pngPath, pdfPath, outPath] = process.argv;
const img = await loadImage(readFileSync(pngPath));
const W = img.width, H = img.height;
const { segs } = await extractSegments(pdfPath, 2);
const { v, h } = axisSegments(segs, 18);
const X = gridLines(v, 4, 90);
const Y = gridLines(h, 4, 90);

const cv = createCanvas(W, H);
const c = cv.getContext('2d');
c.drawImage(img, 0, 0, W, H);

// grid lines
c.lineWidth = 1;
c.font = '10px sans-serif';
c.strokeStyle = 'rgba(0,150,255,0.55)';
c.fillStyle = '#0066ff';
for (const x of X) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); c.fillText(String(x), x + 1, 12); c.fillText(String(x), x + 1, H - 3); }
c.strokeStyle = 'rgba(255,0,160,0.5)';
c.fillStyle = '#cc0066';
for (const y of Y) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.fillText(String(y), 1, y - 1); c.fillText(String(y), W - 22, y - 1); }

writeFileSync(outPath, cv.toBuffer('image/png'));
console.log(`X grid (${X.length}):`, X.join(' '));
console.log(`Y grid (${Y.length}):`, Y.join(' '));
console.log('wrote', outPath, `${W}x${H}`);
