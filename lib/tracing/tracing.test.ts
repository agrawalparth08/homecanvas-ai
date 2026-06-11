import { describe, expect, it } from 'vitest';
import { commit } from '../scene/commit';
import { makePatch } from '../scene/patching';
import { buildSampleHome } from '../fixtures/sample-home';
import {
  type Calibration,
  defaultCalibration,
  imageToPlan,
  mmPerPxFromCalibrationLine,
  planToImage,
} from './coords';
import { axisLock, snapPoint, snapToGrid, snapToPoints } from './snapping';
import { makeOpening, makeRoomRect, makeWall, nearestWall, openingFits, projectOntoWall } from './builders';
import { canAdvance, initWizard, nextStep, prevStep } from './wizard';

describe('tracer coordinate mapping', () => {
  const cal: Calibration = defaultCalibration(10, 1000); // 10mm/px, image 1000px tall

  it('maps image px to plan mm with y flipped (bottom-left origin)', () => {
    expect(imageToPlan({ x: 0, y: 1000 }, cal)).toEqual({ x: 0, y: 0 }); // image bottom-left -> origin
    expect(imageToPlan({ x: 0, y: 0 }, cal)).toEqual({ x: 0, y: 10000 }); // image top -> +y
    expect(imageToPlan({ x: 50, y: 500 }, cal)).toEqual({ x: 500, y: 5000 });
  });

  it('round-trips px <-> mm', () => {
    const px = { x: 123, y: 456 };
    const back = planToImage(imageToPlan(px, cal), cal);
    expect(back.x).toBeCloseTo(px.x, 6);
    expect(back.y).toBeCloseTo(px.y, 6);
  });

  it('derives mm/px from a calibration line', () => {
    expect(mmPerPxFromCalibrationLine({ x: 0, y: 0 }, { x: 100, y: 0 }, 2500)).toBe(25);
    expect(() => mmPerPxFromCalibrationLine({ x: 0, y: 0 }, { x: 0.2, y: 0 }, 2500)).toThrow();
  });
});

describe('snapping', () => {
  it('snaps to a grid', () => {
    expect(snapToGrid({ x: 137, y: 642 }, 50)).toEqual({ x: 150, y: 650 });
  });
  it('snaps to nearby anchors first', () => {
    const anchors = [{ x: 1000, y: 1000 }];
    expect(snapToPoints({ x: 1040, y: 990 }, anchors, 100)).toEqual({ x: 1000, y: 1000 });
    expect(snapToPoints({ x: 1300, y: 1000 }, anchors, 100)).toBeNull();
  });
  it('prefers an anchor, falls back to grid', () => {
    const anchors = [{ x: 1000, y: 1000 }];
    expect(snapPoint({ x: 1040, y: 1010 }, anchors, 50, 100)).toEqual({ x: 1000, y: 1000 });
    expect(snapPoint({ x: 1370, y: 1010 }, anchors, 50, 100)).toEqual({ x: 1350, y: 1000 });
  });
  it('axis-locks to the dominant direction', () => {
    expect(axisLock({ x: 0, y: 0 }, { x: 1000, y: 80 })).toEqual({ x: 1000, y: 0 });
    expect(axisLock({ x: 0, y: 0 }, { x: 80, y: 1000 })).toEqual({ x: 0, y: 1000 });
  });
});

describe('geometry builders', () => {
  it('builds a wall with defaults', () => {
    const w = makeWall('f0', { x: 0, y: 0 }, { x: 3000, y: 0 }, { id: 'w1' });
    expect(w.path.pts).toEqual([{ x: 0, y: 0 }, { x: 3000, y: 0 }]);
    expect(w.source.kind).toBe('traced');
  });

  it('builds an axis-aligned room from any two corners', () => {
    const r = makeRoomRect('f0', 'Test', 'bedroom', { x: 3000, y: 4000 }, { x: 0, y: 0 }, { id: 'r1' });
    expect(r.boundary.outer).toEqual([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    expect(r.ceilingSurface).toBeDefined();
  });

  it('omits the ceiling for open-to-sky rooms', () => {
    const r = makeRoomRect('f0', 'Terrace', 'terrace', { x: 0, y: 0 }, { x: 3000, y: 3000 }, { openToSky: true });
    expect(r.ceilingSurface).toBeUndefined();
  });

  it('projects a point onto a wall and finds the nearest', () => {
    const w = makeWall('f0', { x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'w1' });
    const proj = projectOntoWall({ x: 1000, y: 300 }, w);
    expect(proj.u).toBeCloseTo(0.25, 5);
    expect(proj.dist).toBeCloseTo(300, 5);
    expect(nearestWall({ x: 1000, y: 300 }, [w], 500)?.wall.id).toBe('w1');
    expect(nearestWall({ x: 1000, y: 900 }, [w], 500)).toBeNull();
  });

  it('checks opening fit with stubs', () => {
    const w = makeWall('f0', { x: 0, y: 0 }, { x: 2000, y: 0 }, { id: 'w1' });
    expect(openingFits(w, 0.5, 900)).toBe(true);
    expect(openingFits(w, 0.5, 1990)).toBe(false);
    const o = makeOpening('w1', 'door', 0.5, { width: 900 });
    expect(o.kind).toBe('door');
    expect(o.headHeight).toBeGreaterThan(o.sillHeight);
  });
});

describe('tracer ops through the commit pipeline', () => {
  const base = buildSampleHome();
  const floorId = base.floors[0]!.id;

  it('attaches an underlay and calibration', () => {
    const r1 = commit(
      base,
      makePatch('underlay', [
        { type: 'set_floor_underlay', floorId, underlay: { filePath: 'p/plan.png', opacity: 0.5, widthPx: 800, heightPx: 1000 } },
      ]),
    );
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = commit(
      r1.scene,
      makePatch('calibrate', [
        { type: 'set_floor_calibration', floorId, calibration: { mmPerPx: 12.5, originPx: { x: 0, y: 1000 }, rotationDeg: 0 } },
      ]),
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const floor = r2.scene.floors.find((f) => f.id === floorId)!;
    expect(floor.underlay?.filePath).toBe('p/plan.png');
    expect(floor.calibration?.mmPerPx).toBe(12.5);

    const r3 = commit(r2.scene, makePatch('opacity', [{ type: 'set_underlay_opacity', floorId, opacity: 0.2 }]));
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.scene.floors.find((f) => f.id === floorId)!.underlay?.opacity).toBe(0.2);

    const r4 = commit(r2.scene, makePatch('clear', [{ type: 'clear_floor_underlay', floorId }]));
    expect(r4.ok).toBe(true);
    if (r4.ok) expect(r4.scene.floors.find((f) => f.id === floorId)!.underlay).toBeUndefined();
  });

  it('traces a new wall onto a floor', () => {
    const wall = makeWall(floorId, { x: 0, y: 0 }, { x: 2500, y: 0 }, { id: 'w-trace' });
    const r = commit(base, makePatch('trace wall', [{ type: 'add_wall', floorId, wall }]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scene.floors.find((f) => f.id === floorId)!.walls.some((w) => w.id === 'w-trace')).toBe(true);
  });
});

describe('wizard state machine', () => {
  it('gates each step on its precondition', () => {
    let s = initWizard();
    expect(s.step).toBe('pickFile');
    expect(canAdvance(s)).toBe(false);
    s = nextStep(s);
    expect(s.step).toBe('pickFile'); // blocked: no underlay

    s = { ...s, hasUnderlay: true };
    s = nextStep(s);
    expect(s.step).toBe('scale');
    expect(canAdvance(s)).toBe(false); // not calibrated

    s = nextStep({ ...s, calibrated: true });
    expect(s.step).toBe('trace');

    s = nextStep({ ...s, wallCount: 4 });
    expect(s.step).toBe('rooms');

    s = nextStep({ ...s, roomCount: 2 });
    expect(s.step).toBe('review');

    s = nextStep(s);
    expect(s.step).toBe('done');
  });

  it('goes back without gating', () => {
    const s = { step: 'rooms' as const, hasUnderlay: true, calibrated: true, wallCount: 4, roomCount: 0 };
    expect(prevStep(s).step).toBe('trace');
  });
});
