import { afterEach, describe, expect, it } from 'vitest';
import { makePatch } from '../lib/scene/patching';
import type { BridgeRequest } from '../lib/agent/bridge-protocol';
import { detectClaudeCli, extractJson, parseAutoResponse } from './bridge-auto';

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

  it('completes a minimal place_furniture op (catalogKey) into a valid object', () => {
    // Claude only supplies catalogKey + roomId + position; the heavy schema
    // fields (id, footprint, materialIds, source, dims) are filled server-side.
    const furnish = {
      proposals: [
        {
          id: 'p1',
          summary: 'Add a sofa',
          target: 'Drawing',
          patch: {
            id: 'patch-1',
            origin: 'agent',
            description: 'furnish',
            ops: [{ type: 'place_furniture', object: { catalogKey: 'sofa', roomId: 'room-1', transform: { x: 2000, y: 1500, rotationY: 0 } } }],
          },
        },
      ],
    };
    const out = parseAutoResponse(JSON.stringify(furnish), request);
    expect(out.ok).toBe(true);
    if (out.ok) {
      const op = out.response.proposals[0]!.patch.ops[0] as { type: string; object: { dimensions: { w: number }; footprint: unknown[]; id: string } };
      expect(op.type).toBe('place_furniture');
      expect(op.object.dimensions.w).toBe(2000); // sofa catalog width
      expect(op.object.footprint).toHaveLength(4); // synthesized rectangle
      expect(op.object.id.length).toBeGreaterThan(0);
    }
  });

  it('surfaces a claude CLI error object instead of swallowing it as "no changes"', () => {
    const authErr = 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}';
    const out = parseAutoResponse(authErr, request);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/Invalid authentication credentials/);
  });

  it('rejects output with no proposals array (not a design response)', () => {
    expect(parseAutoResponse('{"note":"hi"}', request).ok).toBe(false);
  });
});

describe('detectClaudeCli', () => {
  afterEach(() => {
    delete process.env['HOMECANVAS_CLAUDE_BIN'];
  });
  it('honours the HOMECANVAS_CLAUDE_BIN override (custom path / test fixture)', () => {
    process.env['HOMECANVAS_CLAUDE_BIN'] = '/tmp/my-claude';
    expect(detectClaudeCli()).toBe('/tmp/my-claude');
  });
});
