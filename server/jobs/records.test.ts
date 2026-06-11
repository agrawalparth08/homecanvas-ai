import { describe, expect, it } from 'vitest';
import { createJob, transition, beat, isStale, isTerminal, JobTransitionError } from './records';

const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

describe('job records', () => {
  it('runs the happy path queued → running → succeeded', () => {
    let j = createJob('j1', 'extract', T(0));
    expect(j.status).toBe('queued');
    j = transition(j, 'running', T(1), { progress: 0.5 });
    expect(j.status).toBe('running');
    expect(j.progress).toBe(0.5);
    j = transition(j, 'succeeded', T(2), { result: { rooms: 3 } });
    expect(j.status).toBe('succeeded');
    expect(j.progress).toBe(1);
    expect(j.result).toEqual({ rooms: 3 });
  });

  it('rejects illegal transitions from a terminal state', () => {
    const done = transition(createJob('j2', 'x', T(0)), 'cancelled', T(1));
    expect(() => transition(done, 'running', T(2))).toThrow(JobTransitionError);
  });

  it('detects stale running jobs via heartbeat', () => {
    const j = transition(createJob('j3', 'x', T(0)), 'running', T(0));
    const t0 = Date.parse(T(0));
    expect(isStale(j, t0 + 5_000, 10_000)).toBe(false);
    expect(isStale(beat(j, T(0)), t0 + 20_000, 10_000)).toBe(true);
  });

  it('isTerminal', () => {
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('running')).toBe(false);
  });
});
