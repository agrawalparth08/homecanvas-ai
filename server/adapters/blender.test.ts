import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { blenderCandidates, detectBlender } from './blender';

const THIS_FILE = fileURLToPath(import.meta.url);

describe('blenderCandidates', () => {
  it('returns the .app path on macOS', () => {
    expect(blenderCandidates('darwin')[0]).toContain('Blender.app');
  });
  it('returns Program Files paths on Windows', () => {
    expect(blenderCandidates('win32').some((p) => p.includes('Blender Foundation'))).toBe(true);
  });
  it('returns common bin paths on Linux', () => {
    expect(blenderCandidates('linux')).toContain('/usr/bin/blender');
  });
});

describe('detectBlender', () => {
  afterEach(() => {
    delete process.env['HOMECANVAS_BLENDER_BIN'];
  });
  it('honours HOMECANVAS_BLENDER_BIN when the file exists', () => {
    process.env['HOMECANVAS_BLENDER_BIN'] = THIS_FILE; // a path that definitely exists
    expect(detectBlender()).toBe(THIS_FILE);
  });
  it('ignores a non-existent override', () => {
    process.env['HOMECANVAS_BLENDER_BIN'] = '/no/such/blender-binary';
    expect(detectBlender()).not.toBe('/no/such/blender-binary');
  });
});
