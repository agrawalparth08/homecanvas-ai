import { describe, expect, it } from 'vitest';
import { makePatch } from '../scene/patching';
import {
  BRIDGE_SCHEMA_VERSION,
  BRIDGE_TTL_MS,
  BridgeProposalSchema,
  BridgeRequestSchema,
  BridgeResponseSchema,
  buildBridgePrompt,
  hashString,
  isExpired,
  isValidBridgeId,
} from './bridge-protocol';

const goodPatch = makePatch(
  'recolour',
  [{ type: 'set_surface_color', surface: { kind: 'roomFloor', roomId: 'room-1' }, color: '#aabbcc' }],
  'agent',
);

const proposal = {
  id: 'p1',
  summary: 'Paint the floor',
  target: 'Kitchen',
  patch: goodPatch,
};

describe('hashString', () => {
  it('is deterministic and order-sensitive', () => {
    expect(hashString('{"a":1}')).toBe(hashString('{"a":1}'));
    expect(hashString('{"a":1}')).not.toBe(hashString('{"a":2}'));
  });
});

describe('isValidBridgeId', () => {
  it('accepts uuid-ish ids, rejects traversal and junk', () => {
    expect(isValidBridgeId('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isValidBridgeId('../etc/passwd')).toBe(false);
    expect(isValidBridgeId('a/b')).toBe(false);
    expect(isValidBridgeId('short')).toBe(false);
  });
});

describe('isExpired', () => {
  it('flags requests older than the TTL', () => {
    expect(isExpired({ createdAt: 1_000 }, 1_000 + BRIDGE_TTL_MS + 1)).toBe(true);
    expect(isExpired({ createdAt: 1_000 }, 1_000 + BRIDGE_TTL_MS - 1)).toBe(false);
  });
});

describe('BridgeProposalSchema', () => {
  it('validates a proposal and fills defaults', () => {
    const parsed = BridgeProposalSchema.parse(proposal);
    expect(parsed.rationale).toBe('');
    expect(parsed.confidence).toBe(0.6);
    expect(parsed.skippedLocked).toEqual([]);
  });
  it('rejects a proposal whose patch has no ops (untrusted output)', () => {
    expect(BridgeProposalSchema.safeParse({ ...proposal, patch: { ...goodPatch, ops: [] } }).success).toBe(false);
  });
});

describe('request/response schemas', () => {
  it('round-trips a valid request', () => {
    const req = {
      schemaVersion: BRIDGE_SCHEMA_VERSION,
      id: 'abc123',
      createdAt: 123,
      message: 'paint the kitchen',
      contentHash: 'deadbeef',
    };
    expect(BridgeRequestSchema.parse(req).message).toBe('paint the kitchen');
  });
  it('rejects a request with a mismatched schemaVersion', () => {
    expect(
      BridgeRequestSchema.safeParse({ schemaVersion: 99, id: 'x', createdAt: 1, message: 'm', contentHash: 'h' }).success,
    ).toBe(false);
  });
  it('rejects a response missing the contentHash correlation field', () => {
    expect(
      BridgeResponseSchema.safeParse({ schemaVersion: 1, requestId: 'x', proposals: [proposal] }).success,
    ).toBe(false);
  });
});

describe('buildBridgePrompt', () => {
  it('embeds the id, hash, and scene for a human session', () => {
    const req = BridgeRequestSchema.parse({
      schemaVersion: BRIDGE_SCHEMA_VERSION,
      id: 'req-9',
      createdAt: 0,
      message: 'make it cosy',
      contentHash: 'cafef00d',
    });
    const prompt = buildBridgePrompt(req, '{"scene":true}');
    expect(prompt).toContain('req-9');
    expect(prompt).toContain('cafef00d');
    expect(prompt).toContain('make it cosy');
    expect(prompt).toContain('{"scene":true}');
  });
});
