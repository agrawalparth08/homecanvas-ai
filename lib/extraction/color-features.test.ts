import { describe, it, expect } from 'vitest';
import {
  classifySegmentColor,
  groupColorFeatures,
  type ColorSegment,
} from './color-features';

describe('classifySegmentColor', () => {
  it('maps the canonical plan colours', () => {
    expect(classifySegmentColor('#000000')).toBe('wall');
    expect(classifySegmentColor('#ff7f00')).toBe('opening');
    expect(classifySegmentColor('#ff00ff')).toBe('column');
  });

  it('is tolerant of anti-aliased / rounded hex (near matches)', () => {
    expect(classifySegmentColor('#0a0a0a')).toBe('wall'); // near-black
    expect(classifySegmentColor('#FF8000')).toBe('opening'); // orange, off by 1 + case
    expect(classifySegmentColor('#fa05f2')).toBe('column'); // magenta-ish
  });

  it('accepts 3-digit hex and is case-insensitive', () => {
    expect(classifySegmentColor('#000')).toBe('wall');
    expect(classifySegmentColor('#F70')).toBe('opening'); // -> #ff7700, near orange
    expect(classifySegmentColor('#F0F')).toBe('column');
  });

  it('falls back to other for unrelated / unparseable colours', () => {
    expect(classifySegmentColor('#3366cc')).toBe('other'); // blue dimension line
    expect(classifySegmentColor('#22aa22')).toBe('other'); // green
    expect(classifySegmentColor('not-a-color')).toBe('other');
    expect(classifySegmentColor('')).toBe('other');
  });
});

describe('groupColorFeatures', () => {
  const seg = (x0: number, y0: number, x1: number, y1: number, color: string): ColorSegment => ({ x0, y0, x1, y1, color });

  it('splits segments into wall / opening / column buckets', () => {
    const segs: ColorSegment[] = [
      seg(0, 0, 100, 0, '#000000'), // wall
      seg(0, 0, 0, 100, '#000'), // wall
      seg(40, 0, 60, 0, '#ff7f00'), // opening
      seg(10, 10, 16, 16, '#ff00ff'), // column
      seg(5, 5, 50, 5, '#3366cc'), // other -> dropped
    ];
    const f = groupColorFeatures(segs);
    expect(f.walls).toHaveLength(2);
    expect(f.openings).toHaveLength(1);
    expect(f.columns).toHaveLength(1);
  });

  it('clusters many nearby opening ticks into ONE feature spanning the gap', () => {
    // Four short orange ticks drawn end-to-end across one window opening.
    const segs: ColorSegment[] = [
      seg(40, 0, 45, 0, '#ff7f00'),
      seg(45, 0, 50, 0, '#ff7f00'),
      seg(50, 0, 55, 0, '#ff7f00'),
      seg(55, 0, 60, 0, '#ff7f00'),
    ];
    const f = groupColorFeatures(segs);
    expect(f.openings).toHaveLength(1);
    const o = f.openings[0]!;
    // merged span runs the full 40->60 extent (length 20)
    expect(Math.min(o.x0, o.x1)).toBe(40);
    expect(Math.max(o.x0, o.x1)).toBe(60);
    expect(Math.hypot(o.x1 - o.x0, o.y1 - o.y0)).toBeCloseTo(20);
  });

  it('keeps two FAR-APART openings as two distinct features', () => {
    const segs: ColorSegment[] = [
      seg(40, 0, 60, 0, '#ff7f00'),
      seg(400, 0, 420, 0, '#ff7f00'), // far away on the other side of the plan
    ];
    const f = groupColorFeatures(segs);
    expect(f.openings).toHaveLength(2);
  });

  it('merges a scattered column into one box-spanning feature', () => {
    // A magenta pillar drawn as four short edge segments.
    const segs: ColorSegment[] = [
      seg(10, 10, 16, 10, '#ff00ff'),
      seg(16, 10, 16, 16, '#ff00ff'),
      seg(16, 16, 10, 16, '#ff00ff'),
      seg(10, 16, 10, 10, '#ff00ff'),
    ];
    const f = groupColorFeatures(segs);
    expect(f.columns).toHaveLength(1);
  });

  it('respects the gap parameter for clustering proximity', () => {
    const segs: ColorSegment[] = [
      seg(0, 0, 10, 0, '#ff7f00'),
      seg(25, 0, 35, 0, '#ff7f00'), // 15 units away from the first
    ];
    expect(groupColorFeatures(segs, 5).openings).toHaveLength(2); // tight gap -> separate
    expect(groupColorFeatures(segs, 30).openings).toHaveLength(1); // loose gap -> merged
  });
});
