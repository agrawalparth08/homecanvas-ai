import { beforeEach, describe, expect, it } from 'vitest';
import { reportError, useErrors } from '@/store/error-store';

beforeEach(() => useErrors.getState().clear());

describe('error-store', () => {
  it('reports an error with kind, message and detail', () => {
    reportError('boom', { kind: 'runtime', detail: 'stack-trace-here' });
    const errors = useErrors.getState().errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ kind: 'runtime', message: 'boom', detail: 'stack-trace-here' });
    expect(errors[0]!.id).toMatch(/^err-\d+$/);
  });

  it('defaults kind to runtime', () => {
    reportError('plain');
    expect(useErrors.getState().errors[0]!.kind).toBe('runtime');
  });

  it('collapses an immediate repeat of the same message+kind', () => {
    reportError('save failed', { kind: 'network' });
    reportError('save failed', { kind: 'network' });
    reportError('save failed', { kind: 'network' });
    expect(useErrors.getState().errors).toHaveLength(1);
  });

  it('does NOT collapse the same text under a different kind', () => {
    reportError('same text', { kind: 'network' });
    reportError('same text', { kind: 'rejected' });
    expect(useErrors.getState().errors).toHaveLength(2);
  });

  it('stacks distinct messages and keeps insertion order', () => {
    reportError('first', { kind: 'rejected' });
    reportError('second', { kind: 'rejected' });
    const msgs = useErrors.getState().errors.map((e) => e.message);
    expect(msgs).toEqual(['first', 'second']);
  });

  it('caps the visible stack and drops the oldest', () => {
    for (let i = 0; i < 9; i += 1) reportError(`msg-${i}`, { kind: 'info' });
    const errors = useErrors.getState().errors;
    expect(errors).toHaveLength(6);
    expect(errors[0]!.message).toBe('msg-3'); // 0,1,2 fell off
    expect(errors[5]!.message).toBe('msg-8');
  });

  it('dismiss removes a single error by id; clear empties the stack', () => {
    reportError('a', { kind: 'info' });
    reportError('b', { kind: 'info' });
    const id = useErrors.getState().errors[0]!.id;
    useErrors.getState().dismiss(id);
    expect(useErrors.getState().errors.map((e) => e.message)).toEqual(['b']);
    useErrors.getState().clear();
    expect(useErrors.getState().errors).toHaveLength(0);
  });

  it('truncates an over-long message and detail', () => {
    reportError('x'.repeat(1000), { detail: 'y'.repeat(5000) });
    const e = useErrors.getState().errors[0]!;
    expect(e.message.length).toBe(600);
    expect(e.detail!.length).toBe(4000);
  });
});
