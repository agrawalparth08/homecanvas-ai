import { describe, expect, it } from 'vitest';
import { autoTraceFromWalls, autoTraceDxf } from './auto-trace';
import type { WallLine } from './rooms-from-walls';

const BOX_DXF = `0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
10
0
20
0
11
0
21
100
0
LINE
10
200
20
0
11
200
21
100
0
LINE
10
0
20
0
11
200
21
0
0
LINE
10
0
20
100
11
200
21
100
0
ENDSEC
0
EOF`;

describe('autoTraceFromWalls', () => {
  it('bridges a door gap and emits a confident room candidate', () => {
    const walls: WallLine[] = [
      { orient: 'v', coord: 0, lo: 0, hi: 100 },
      { orient: 'v', coord: 100, lo: 0, hi: 40 },
      { orient: 'v', coord: 100, lo: 70, hi: 100 }, // door gap
      { orient: 'h', coord: 0, lo: 0, hi: 100 },
      { orient: 'h', coord: 100, lo: 0, hi: 100 },
    ];
    const res = autoTraceFromWalls(walls, { maxGap: 60 });
    expect(res.rooms).toHaveLength(1);
    expect(res.rooms[0]!.rect).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 });
    expect(res.rooms[0]!.confidence).toBeGreaterThan(0.6);
  });
});

describe('autoTraceDxf', () => {
  it('traces a DXF box to one room and reads units', () => {
    const res = autoTraceDxf(BOX_DXF);
    expect(res.unitsToMm).toBe(1);
    expect(res.rooms).toHaveLength(1);
    expect(res.rooms[0]!.rect).toEqual({ x0: 0, y0: 0, x1: 200, y1: 100 });
  });
});
