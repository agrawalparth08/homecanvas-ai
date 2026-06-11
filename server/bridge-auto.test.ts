import { describe, expect, it } from 'vitest';
import { makePatch } from '../lib/scene/patching';
import type { BridgeRequest } from '../lib/agent/bridge-protocol';
import { extractJson, parseAutoResponse } from './bridge-auto';

const request: BridgeRequest = {
  schemaVersion: 1,
  id: 'req-1',
  createdAt: 1,
  message: 'make the kitchen warmer',
  contentHash: 'abc123',
};

const goodPatch = makePatch(
  'recolour',
  [{ type: 'set_surface_color', surface: { kind: 'roomFloor', roomId: 'room-1' }, color: '#aabbcc' }],
  'agent',
);
const proposal = { id: 'p1', summary: 'Warm floor', target: 'Kitchen', patch: goodPatch };

describe('extractJson', () => {
  it('parses plain, fenced, and prose-wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here:\n{"a":1}\nHope that helps')).toEqual({ a: 1 });
  });
  it('returns null when there is no JSON object', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{ not valid }')).toBeNull();
  });
});

describe('parseAutoResponse', () => {
  it('accepts valid proposals and FORCES the request id + hash', () => {
    const out = parseAutoResponse(JSON.stringify({ proposals: [proposal], requestId: 'WRONG', contentHash: 'WRONG' }), request);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.requestId).toBe('req-1'); // not the model's WRONG
      expect(out.response.contentHash).toBe('abc123');
      expect(out.response.proposals).toHaveLength(1);
    }
  });

  it('rejects a proposal whose patch has no ops (untrusted model output)', () => {
    const bad = { proposals: [{ ...proposal, patch: { ...goodPatch, ops: [] } }] };
    expect(parseAutoResponse(JSON.stringify(bad), request).ok).toBe(false);
  });

  it('treats no-JSON output as a parse failure', () => {
    expect(parseAutoResponse('the model rambled', request).ok).toBe(false);
  });

  it('accepts an empty proposal set (valid "no change") response', () => {
    const out = parseAutoResponse('{"proposals":[],"note":"nothing to do"}', request);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.response.proposals).toEqual([]);
  });
});
