import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { ExtractionReviewSchema, type HomeScene } from '../scene/schemas';
import { reviewExtraction } from './review';

const src = { kind: 'extracted' as const, confidence: 1 };
const wall = (id: string, ax: number, ay: number, bx: number, by: number, thickness = 115) => ({
  id,
  thickness,
  path: { pts: [{ x: ax, y: ay }, { x: bx, y: by }] },
  source: src,
});
const room = (id: string, name: string, x0: number, y0: number, x1: number, y1: number) => ({
  id,
  name,
  boundary: { outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] },
  source: src,
});
const obj = (id: string, name: string, roomId: string, x: number, y: number) => ({
  id,
  name,
  roomId,
  transform: { x, y, elevation: 0, rotationY: 0 },
});
const scene = (rooms: unknown[], walls: unknown[], objects: unknown[] = []) =>
  ({ floors: [{ rooms, walls, objects }] }) as unknown as HomeScene;

const enclosing = (x1: number, y1: number) => [
  wall('we1', 0, 0, x1, 0),
  wall('we2', x1, 0, x1, y1),
  wall('we3', x1, y1, 0, y1),
  wall('we4', 0, y1, 0, 0),
];

describe('reviewExtraction', () => {
  it('produces no error/warning issues on the clean sample home', () => {
    const review = reviewExtraction(buildSampleHome());
    const bad = review.issues.filter((i) => i.severity !== 'info');
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(ExtractionReviewSchema.safeParse(review).success).toBe(true);
  });

  it('flags a too-thin wall by id', () => {
    const s = scene([room('r1', 'Room 1', 0, 0, 4000, 4000)], [...enclosing(4000, 4000), wall('thin', 1000, 0, 1000, 4000, 5)]);
    const issue = reviewExtraction(s).issues.find((i) => i.kind === 'suspicious-dimension');
    expect(issue?.severity).toBe('warning');
    expect(issue?.entityId).toBe('thin');
  });

  it('flags furniture placed outside its room', () => {
    const s = scene([room('r1', 'Room 1', 0, 0, 4000, 4000)], enclosing(4000, 4000), [obj('o1', 'Sofa', 'r1', 9000, 9000)]);
    const issue = reviewExtraction(s).issues.find((i) => i.kind === 'impossible-placement');
    expect(issue?.severity).toBe('warning');
    expect(issue?.entityId).toBe('o1');
  });

  it('reports a coverage gap when rooms under-fill the floor extent', () => {
    // floor extent 10000x10000 = 1e8; one room 3000x10000 = 3e7 -> 30%
    const s = scene([room('r1', 'Room 1', 0, 0, 3000, 10000)], enclosing(10000, 10000));
    const review = reviewExtraction(s);
    expect(review.coverage).toBeCloseTo(0.3, 2);
    expect(review.issues.some((i) => i.kind === 'coverage-gap')).toBe(true);
  });

  it('flags a low-confidence cluster as an info issue', () => {
    const lc = { id: 'lc', thickness: 115, path: { pts: [{ x: 500, y: 2000 }, { x: 3500, y: 2000 }] }, source: { kind: 'extracted' as const, confidence: 0.3 } };
    const s = scene([room('r1', 'Room 1', 0, 0, 4000, 4000)], [...enclosing(4000, 4000), lc]);
    const issue = reviewExtraction(s).issues.find((i) => i.kind === 'low-confidence');
    expect(issue?.severity).toBe('info');
  });

  it('sorts all warnings before all infos, deterministically', () => {
    // thin wall => warning; low-confidence wall => info; room fully covers floor (no coverage info)
    const lc = { id: 'lc', thickness: 115, path: { pts: [{ x: 500, y: 2000 }, { x: 3500, y: 2000 }] }, source: { kind: 'extracted' as const, confidence: 0.3 } };
    const s = scene([room('r1', 'Room 1', 0, 0, 4000, 4000)], [...enclosing(4000, 4000), wall('thin', 1000, 100, 1000, 3900, 5), lc]);
    const issues = reviewExtraction(s).issues;
    const firstInfo = issues.findIndex((i) => i.severity === 'info');
    const lastWarning = issues.map((i) => i.severity).lastIndexOf('warning');
    expect(firstInfo).toBeGreaterThan(-1);
    expect(lastWarning).toBeGreaterThan(-1);
    expect(lastWarning).toBeLessThan(firstInfo); // every warning precedes every info
    expect(issues.map((i) => i.id)).toEqual(reviewExtraction(s).issues.map((i) => i.id)); // stable
  });
});
