import { describe, expect, it } from 'vitest';
import { dwgConverterCandidates } from './converters';

describe('dwgConverterCandidates', () => {
  it('macOS: ODA app + Homebrew dwg2dxf', () => {
    const c = dwgConverterCandidates('darwin');
    expect(c.some((x) => x.kind === 'oda' && x.path.includes('ODAFileConverter.app'))).toBe(true);
    expect(c.some((x) => x.kind === 'libredwg' && x.path.endsWith('dwg2dxf'))).toBe(true);
  });
  it('Windows: Program Files', () => {
    expect(dwgConverterCandidates('win32')[0]!.path).toContain('Program Files');
  });
  it('Linux: dwg2dxf only', () => {
    expect(dwgConverterCandidates('linux').every((x) => x.kind === 'libredwg')).toBe(true);
  });
});
