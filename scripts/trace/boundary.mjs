import { extractSegments, gridLines } from './lib.mjs';

function analyze(pdf, label) {
  return extractSegments(pdf, 2).then(({ segs }) => {
    const isBlack = (c) => c === '#000000';
    const isRed = (c) => c === '#ff0000';
    // long axis segments
    const vert = (s, colf) => Math.abs(s[2]-s[0])<1.5 && Math.hypot(s[2]-s[0],s[3]-s[1])>40 && colf(s[4]);
    const horiz = (s, colf) => Math.abs(s[3]-s[1])<1.5 && Math.hypot(s[2]-s[0],s[3]-s[1])>40 && colf(s[4]);
    const blackV = segs.filter((s)=>vert(s,isBlack)).map((s)=>({coord:(s[0]+s[2])/2, len:Math.abs(s[3]-s[1])}));
    const blackH = segs.filter((s)=>horiz(s,isBlack)).map((s)=>({coord:(s[1]+s[3])/2, len:Math.abs(s[2]-s[0])}));
    const redV = segs.filter((s)=>vert(s,isRed)).map((s)=>(s[0]+s[2])/2);
    // black-wall extent (ignore page frame near x=5/993, y=5/1413)
    const inside = (v)=> v>15 && v<985;
    const insideY = (v)=> v>15 && v<1405;
    const bxs = blackV.map((b)=>b.coord).filter(inside);
    const bys = blackH.map((b)=>b.coord).filter(insideY);
    const Xlines = gridLines(blackV, 4, 120);
    const Ylines = gridLines(blackH, 4, 120);
    console.log(`\n=== ${label} ===`);
    console.log('BLACK wall extent px:  x[', Math.min(...bxs)|0, '..', Math.max(...bxs)|0, ']  y[', Math.min(...bys)|0, '..', Math.max(...bys)|0, ']');
    console.log('BLACK vertical grid lines x:', Xlines.join(' '));
    console.log('BLACK horizontal grid lines y:', Ylines.join(' '));
    console.log('RED vertical lines x (sheet border):', [...new Set(redV.map((v)=>Math.round(v)))].sort((a,b)=>a-b).join(' '));
  });
}
await analyze(process.cwd()+'/private-home-inputs/raw/lower floor final plan.pdf', 'LOWER');
await analyze(process.cwd()+'/private-home-inputs/raw/upper floor final plan.pdf', 'UPPER');
