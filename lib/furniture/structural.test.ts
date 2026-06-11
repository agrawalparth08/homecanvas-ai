import { describe, expect, it } from 'vitest';
import { isStructuralColumn } from './structural';

describe('isStructuralColumn', () => {
  it('is true for a column procedural kind', () => {
    expect(isStructuralColumn({ procedural: { kind: 'column' } })).toBe(true);
  });

  it('is false for other procedural kinds', () => {
    expect(isStructuralColumn({ procedural: { kind: 'sofa' } })).toBe(false);
    expect(isStructuralColumn({ procedural: { kind: 'bed' } })).toBe(false);
  });

  it('is false when there is no procedural block (e.g. a glTF asset piece)', () => {
    expect(isStructuralColumn({})).toBe(false);
    expect(isStructuralColumn({ procedural: undefined })).toBe(false);
  });
});
