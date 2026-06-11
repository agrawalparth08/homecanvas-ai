import { describe, expect, it } from 'vitest';
import { parseDxf } from './dxf';
import { healWalls } from '../extraction/heal-walls';
import { detectRooms } from '../extraction/rooms-from-walls';

// minimal DXF: a closed 200x100 box (4 LINEs) + a room label, units = mm (4).
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
8
WALL
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
8
WALL
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
8
WALL
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
8
WALL
10
0
20
100
11
200
21
100
0
TEXT
8
LABELS
10
100
20
50
1
LIVING
0
ENDSEC
0
EOF`;

describe('parseDxf', () => {
  it('extracts axis walls, labels and units', () => {
    const plan = parseDxf(BOX_DXF);
    expect(plan.unitsToMm).toBe(1); // mm
    expect(plan.walls.filter((w) => w.orient === 'v')).toHaveLength(2);
    expect(plan.walls.filter((w) => w.orient === 'h')).toHaveLength(2);
    expect(plan.labels).toEqual([{ text: 'LIVING', x: 100, y: 50 }]);
    expect(plan.bounds).toEqual({ x0: 0, y0: 0, x1: 200, y1: 100 });
  });

  it('feeds the extraction pipeline → one room', () => {
    const plan = parseDxf(BOX_DXF);
    const rooms = detectRooms(healWalls(plan.walls));
    expect(rooms).toEqual([{ x0: 0, y0: 0, x1: 200, y1: 100 }]);
  });
});
