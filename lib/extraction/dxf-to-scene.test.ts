import { describe, it, expect } from 'vitest';
import { primitivePlanFromDxf, autoTraceDxfToScene } from './auto-trace';
import { HomeSceneSchema } from '../scene/schemas';
import { validateScene } from '../scene/validation';

// A realistic 4000x3000 mm room (4 LINEs on WALL layer) + a label, units = mm.
const ROOM_DXF = `0
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
3000
0
LINE
8
WALL
10
4000
20
0
11
4000
21
3000
0
LINE
8
WALL
10
0
20
0
11
4000
21
0
0
LINE
8
WALL
10
0
20
3000
11
4000
21
3000
0
TEXT
8
LABELS
10
2000
20
1500
1
LIVING
0
ENDSEC
0
EOF`;

describe('DXF → PrimitivePlan → HomeScene', () => {
  it('converts a DXF into a CAD-provenance PrimitivePlan', () => {
    const plan = primitivePlanFromDxf(ROOM_DXF);
    expect(plan.source).toBe('cad');
    expect(plan.walls).toHaveLength(4);
    expect(plan.labels).toEqual([{ text: 'LIVING', x: 2000, y: 1500 }]);
  });

  it('builds a valid HomeScene with the four walls and the enclosed room', () => {
    const scene = autoTraceDxfToScene(ROOM_DXF, { now: '2026-01-01T00:00:00.000Z', name: 'CAD import' });
    expect(HomeSceneSchema.safeParse(scene).success).toBe(true);
    expect(validateScene(scene).filter((i) => i.severity === 'error')).toEqual([]);
    const floor = scene.floors[0]!;
    expect(floor.walls).toHaveLength(4);
    expect(floor.rooms.length).toBeGreaterThanOrEqual(1);
  });
});
