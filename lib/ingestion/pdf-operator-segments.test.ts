import { describe, it, expect } from 'vitest';
import { operatorListToColorSegments } from './pdf-operator-segments';
import type { ColorSegment } from '../extraction/color-features';

/**
 * Hand-built `OPS` stub mirroring the few pdfjs opcodes this loader reads. The
 * exact numbers are arbitrary (the real enum is opaque); only identity matters.
 */
const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  setStrokeRGBColor: 13,
  constructPath: 91,
  // an unrelated op the walk must ignore.
  fill: 22,
} as const;

/** Build a {fnArray, argsArray} operator list from [op, args] pairs. */
function opList(ops: Array<[number, unknown]>) {
  return { fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) };
}

/** A constructPath argument tuple: [opsArray, [flat [op,x,y,...] subpaths]]. */
function path(...subpaths: number[][]) {
  return [[], subpaths];
}

describe('operatorListToColorSegments', () => {
  it('walks save/transform + setStrokeRGBColor + constructPath into transformed coloured segments', () => {
    // CTM after transform: [2,0,0,2,10,20] => (x,y) -> (2x+10, 2y+20).
    const list = opList([
      [OPS.save, null],
      [OPS.transform, [2, 0, 0, 2, 10, 20]],
      [OPS.setStrokeRGBColor, ['#ff7f00']],
      // L-shaped polyline: move(0,0) -> line(50,0) -> line(50,40).
      [OPS.constructPath, path([0, 0, 0, 1, 50, 0, 1, 50, 40])],
      [OPS.restore, null],
    ]);

    const segs = operatorListToColorSegments(list, OPS);

    expect(segs).toEqual<ColorSegment[]>([
      // (0,0)->(50,0) under CTM: (10,20)->(110,20)
      { x0: 10, y0: 20, x1: 110, y1: 20, color: '#ff7f00' },
      // (50,0)->(50,40) under CTM: (110,20)->(110,100)
      { x0: 110, y0: 20, x1: 110, y1: 100, color: '#ff7f00' },
    ]);
  });

  it('restores the CTM and stroke colour on OPS.restore (transform is scoped)', () => {
    const list = opList([
      // black segment at base CTM (identity).
      [OPS.setStrokeRGBColor, ['#000000']],
      [OPS.constructPath, path([0, 0, 0, 1, 10, 0])],
      // scoped: scale x3 + magenta, then pop back.
      [OPS.save, null],
      [OPS.transform, [3, 0, 0, 3, 0, 0]],
      [OPS.setStrokeRGBColor, ['#ff00ff']],
      [OPS.constructPath, path([0, 0, 0, 1, 10, 0])], // -> (0,0)->(30,0) magenta
      [OPS.restore, null],
      // back to identity CTM + black colour.
      [OPS.constructPath, path([0, 0, 0, 1, 10, 0])], // -> (0,0)->(10,0) black
    ]);

    const segs = operatorListToColorSegments(list, OPS);

    expect(segs).toEqual<ColorSegment[]>([
      { x0: 0, y0: 0, x1: 10, y1: 0, color: '#000000' },
      { x0: 0, y0: 0, x1: 30, y1: 0, color: '#ff00ff' },
      { x0: 0, y0: 0, x1: 10, y1: 0, color: '#000000' },
    ]);
  });

  it('composes nested transforms multiplicatively', () => {
    // outer scale 2, then inner translate (5,5): point (1,1) -> ((1+5)*2, (1+5)*2) = (12,12).
    const list = opList([
      [OPS.transform, [2, 0, 0, 2, 0, 0]],
      [OPS.transform, [1, 0, 0, 1, 5, 5]],
      [OPS.constructPath, path([0, 0, 0, 1, 1, 1])],
    ]);
    const segs = operatorListToColorSegments(list, OPS);
    expect(segs).toEqual<ColorSegment[]>([{ x0: 10, y0: 10, x1: 12, y1: 12, color: '#000000' }]);
  });

  it('applies the optional scale as the base transform', () => {
    const list = opList([[OPS.constructPath, path([0, 0, 0, 1, 4, 6])]]);
    const segs = operatorListToColorSegments(list, OPS, { scale: 2 });
    expect(segs).toEqual<ColorSegment[]>([{ x0: 0, y0: 0, x1: 8, y1: 12, color: '#000000' }]);
  });

  it('accepts numeric [r,g,b] stroke colour args (standard pdfjs)', () => {
    const list = opList([
      [OPS.setStrokeRGBColor, [255, 127, 0]],
      [OPS.constructPath, path([0, 0, 0, 1, 1, 0])],
    ]);
    const segs = operatorListToColorSegments(list, OPS);
    expect(segs[0]!.color).toBe('#ff7f00');
  });

  it('treats every moveTo as a subpath break (no segment across the gap)', () => {
    // move(0,0)->line(10,0) ; move(100,0)->line(110,0): two segments, no (10,0)->(100,0).
    const list = opList([
      [OPS.constructPath, path([0, 0, 0, 1, 10, 0, 0, 100, 0, 1, 110, 0])],
    ]);
    const segs = operatorListToColorSegments(list, OPS);
    expect(segs).toEqual<ColorSegment[]>([
      { x0: 0, y0: 0, x1: 10, y1: 0, color: '#000000' },
      { x0: 100, y0: 0, x1: 110, y1: 0, color: '#000000' },
    ]);
  });

  it('handles multiple subpaths in one constructPath tuple', () => {
    const list = opList([
      [OPS.constructPath, path([0, 0, 0, 1, 5, 0], [0, 0, 5, 1, 0, 10])],
    ]);
    const segs = operatorListToColorSegments(list, OPS);
    expect(segs).toEqual<ColorSegment[]>([
      { x0: 0, y0: 0, x1: 5, y1: 0, color: '#000000' },
      { x0: 0, y0: 5, x1: 0, y1: 10, color: '#000000' },
    ]);
  });

  it('ignores unrelated ops and an unbalanced restore (no throw)', () => {
    const list = opList([
      [OPS.fill, [1]],
      [OPS.restore, null], // nothing on the stack -> falls back to base CTM/colour
      [OPS.constructPath, path([0, 0, 0, 1, 3, 0])],
    ]);
    const segs = operatorListToColorSegments(list, OPS);
    expect(segs).toEqual<ColorSegment[]>([{ x0: 0, y0: 0, x1: 3, y1: 0, color: '#000000' }]);
  });

  it('returns no segments for an empty operator list', () => {
    expect(operatorListToColorSegments(opList([]), OPS)).toEqual([]);
  });
});
