import { extractSegments } from './lib.mjs';
for (const [label, pdf] of [['LOWER','lower floor final plan'],['UPPER','upper floor final plan']]) {
  const { segs } = await extractSegments(process.cwd()+`/private-home-inputs/raw/${pdf}.pdf`, 2);
  const byColor = new Map();
  for (const s of segs) {
    const len = Math.hypot(s[2]-s[0], s[3]-s[1]);
    if (len < 6) continue;
    const c = s[4];
    if (!byColor.has(c)) byColor.set(c, { n: 0, len: 0, x0:1e9,y0:1e9,x1:-1e9,y1:-1e9 });
    const e = byColor.get(c); e.n++; e.len += len;
    e.x0=Math.min(e.x0,s[0],s[2]); e.x1=Math.max(e.x1,s[0],s[2]);
    e.y0=Math.min(e.y0,s[1],s[3]); e.y1=Math.max(e.y1,s[1],s[3]);
  }
  console.log(`\n=== ${label} colors (len-weighted) ===`);
  for (const [c,e] of [...byColor.entries()].sort((a,b)=>b[1].len-a[1].len))
    console.log(`  ${c}  segs=${String(e.n).padStart(4)}  totLen=${(e.len|0).toString().padStart(6)}  bbox x[${e.x0|0}..${e.x1|0}] y[${e.y0|0}..${e.y1|0}]`);
}
