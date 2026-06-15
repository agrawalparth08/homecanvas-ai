import { describe, expect, it } from 'vitest';
import { linesFromMask, type MaskLine } from './lines-from-mask';

/**
 * Build a boolean mask from a row-major string sketch: '#' (or any non-space)
 * is a wall pixel, ' ' / '.' is empty. All rows are padded to equal width so
 * mask[y][x] is well-defined everywhere.
 */
function maskOf(rows: string[]): boolean[][] {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => {
    const out: boolean[] = [];
    for (let x = 0; x < w; x++) {
      const ch = r[x] ?? ' ';
      out.push(ch !== ' ' && ch !== '.');
    }
    return out;
  });
}

/** A fully empty WxH mask. */
function emptyMask(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => false));
}

/** Order-independent membership check (output order is stable but we assert content). */
function hasLine(lines: MaskLine[], want: MaskLine): boolean {
  return lines.some(
    (l) => l.x0 === want.x0 && l.y0 === want.y0 && l.x1 === want.x1 && l.y1 === want.y1,
  );
}

describe('linesFromMask', () => {
  it('extracts 4 border segments (2 vertical + 2 horizontal) from a hollow rectangle', () => {
    // 9 wide x 9 tall hollow border so every border run (length 9) clears the
    // default minRunPx of 8, while the interior gaps (length 7) do not.
    const mask = maskOf([
      '#########', // y=0 top
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#########', // y=8 bottom
    ]);
    const lines = linesFromMask(mask);

    // Two vertical segments: the left (x=0) and right (x=8) columns, full height.
    expect(hasLine(lines, { x0: 0, y0: 0, x1: 0, y1: 8 })).toBe(true);
    expect(hasLine(lines, { x0: 8, y0: 0, x1: 8, y1: 8 })).toBe(true);
    // Two horizontal segments: the top (y=0) and bottom (y=8) rows, full width.
    expect(hasLine(lines, { x0: 0, y0: 0, x1: 8, y1: 0 })).toBe(true);
    expect(hasLine(lines, { x0: 0, y0: 8, x1: 8, y1: 8 })).toBe(true);

    // Exactly 2 verticals + 2 horizontals; the interior column/row spans of the
    // border pixels (length 7 < minRunPx 8) carry no full-length run.
    expect(lines).toHaveLength(4);

    // Stable order: verticals (x ascending) before horizontals (y ascending).
    expect(lines).toEqual([
      { x0: 0, y0: 0, x1: 0, y1: 8 },
      { x0: 8, y0: 0, x1: 8, y1: 8 },
      { x0: 0, y0: 0, x1: 8, y1: 0 },
      { x0: 0, y0: 8, x1: 8, y1: 8 },
    ]);
  });

  it('extracts a single horizontal line from a one-row bar', () => {
    const mask = maskOf(['..##########..']); // 10-px run at x=2..11 on row 0
    const lines = linesFromMask(mask);
    expect(lines).toEqual([{ x0: 2, y0: 0, x1: 11, y1: 0 }]);
  });

  it('bridges a gap <= mergeGapPx into one run', () => {
    // x=0..4 wall, 2-px gap (x=5,6), x=7..11 wall. With mergeGapPx=3 → one run.
    const mask = maskOf(['#####..#####']);
    const bridged = linesFromMask(mask, { minRunPx: 5, mergeGapPx: 3 });
    expect(bridged).toEqual([{ x0: 0, y0: 0, x1: 11, y1: 0 }]);

    // Same mask with mergeGapPx=1 leaves the gap → two separate runs.
    const split = linesFromMask(mask, { minRunPx: 5, mergeGapPx: 1 });
    expect(split).toEqual([
      { x0: 0, y0: 0, x1: 4, y1: 0 },
      { x0: 7, y0: 0, x1: 11, y1: 0 },
    ]);
  });

  it('ignores speckle shorter than minRunPx', () => {
    // A 3-px run on row 0; with default minRunPx (8) it must be dropped.
    const mask = maskOf(['###.........']);
    expect(linesFromMask(mask)).toEqual([]);
    // Lowering the threshold below the run length surfaces it.
    expect(linesFromMask(mask, { minRunPx: 3 })).toEqual([{ x0: 0, y0: 0, x1: 2, y1: 0 }]);
  });

  it('returns [] for an empty mask and for a zero-size mask', () => {
    expect(linesFromMask(emptyMask(10, 10))).toEqual([]);
    expect(linesFromMask([])).toEqual([]);
    expect(linesFromMask([[]])).toEqual([]);
  });

  it('is deterministic: identical input yields identical output', () => {
    const mask = maskOf([
      '##########',
      '#........#',
      '#........#',
      '##########',
    ]);
    expect(linesFromMask(mask)).toEqual(linesFromMask(mask));
  });
});
