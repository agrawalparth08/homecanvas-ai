import { describe, expect, it } from 'vitest';
import { classifyLayer, parseDxfLayered } from './dxf-layered';

/**
 * Synthetic DXF (group-code string format, as in dxf.test.ts), units = mm ($INSUNITS 4):
 *   - A-WALL: three walls — two axis-aligned + ONE clearly angled (0,0)→(300,400)
 *   - A-DOOR: a door marker LINE (length 900)
 *   - A-COLS: a structural column CIRCLE (r=150) at (1000,1000)
 *   - A-ANNO: a TEXT room label "LIVING"
 */
const DXF = `0
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
A-WALL
10
0
20
0
11
600
21
0
0
LINE
8
A-WALL
10
600
20
0
11
600
21
400
0
LINE
8
A-WALL
10
0
20
0
11
300
21
400
0
LINE
8
A-DOOR
10
100
20
0
11
1000
21
0
0
CIRCLE
8
A-COLS
10
1000
20
1000
40
150
0
TEXT
8
A-ANNO
10
300
20
200
1
LIVING
0
ENDSEC
0
EOF`;

describe('classifyLayer', () => {
  it('maps common AIA / synonym layer names', () => {
    expect(classifyLayer('A-WALL')).toBe('wall');
    expect(classifyLayer('MUR-EXT')).toBe('wall');
    expect(classifyLayer('A-DOOR')).toBe('door');
    expect(classifyLayer('PORTE')).toBe('door');
    expect(classifyLayer('A-GLAZ')).toBe('window');
    expect(classifyLayer('WINDOWS')).toBe('window');
    expect(classifyLayer('A-COLS')).toBe('column');
    expect(classifyLayer('PILLAR')).toBe('column');
    expect(classifyLayer('STAIR-1')).toBe('stair');
    expect(classifyLayer('A-ANNO-DIMS')).toBe('dimension');
    expect(classifyLayer('FURN')).toBe('furniture');
    expect(classifyLayer('')).toBe('other');
    expect(classifyLayer('RANDOM-LAYER')).toBe('other');
  });
});

describe('parseDxfLayered', () => {
  it('parses into a valid cad PrimitivePlan with mm units', () => {
    const plan = parseDxfLayered(DXF);
    expect(plan.source).toBe('cad');
    expect(plan.unitsToMm).toBe(1); // $INSUNITS 4 → mm
  });

  it('keeps the angled wall as a non-axis segment', () => {
    const plan = parseDxfLayered(DXF);
    expect(plan.walls.length).toBe(3);
    const angled = plan.walls.filter((w) => {
      const dx = Math.abs(w.b.x - w.a.x), dy = Math.abs(w.b.y - w.a.y);
      return dx > 1 && dy > 1; // neither horizontal nor vertical
    });
    expect(angled.length).toBe(1);
    expect(angled[0]!.layer).toBe('A-WALL');
  });

  it('routes door/window markers to openings and columns from CIRCLEs', () => {
    const plan = parseDxfLayered(DXF);
    expect(plan.openings.length).toBeGreaterThanOrEqual(1);
    expect(plan.openings[0]!.kind).toBe('door');
    expect(plan.openings[0]!.width).toBeGreaterThan(0);
    expect(plan.columns.length).toBeGreaterThanOrEqual(1);
    expect(plan.columns[0]!.width).toBe(300); // diameter = 2r
    expect(plan.columns[0]!.center).toEqual({ x: 1000, y: 1000 });
  });

  it('captures TEXT on an annotation layer as a label', () => {
    const plan = parseDxfLayered(DXF);
    expect(plan.labels).toContainEqual({ text: 'LIVING', x: 300, y: 200 });
  });

  it('tessellates polyline arc bulges into multiple short chords', () => {
    // an LWPOLYLINE on A-WALL whose first segment (0,0)→(1000,0) is a half-circle
    // (bulge=1 on vertex 0). That single arc span must become many short chords.
    const arcDxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
A-WALL
90
2
70
0
10
0
20
0
42
1
10
1000
20
0
0
ENDSEC
0
EOF`;
    const plan = parseDxfLayered(arcDxf, { arcChord: 100 });
    // half-circle r=500 ≈ 1571 length / 100 ⇒ ~16 chords (≫ a single straight one)
    expect(plan.walls.length).toBeGreaterThan(5);
  });
});
