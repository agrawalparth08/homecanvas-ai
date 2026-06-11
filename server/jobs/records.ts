/**
 * Extraction job records + state machine (Phase 3).
 * Pure record logic (transitions, staleness) so the sidecar job runner is
 * testable; the runner that spawns child processes wraps this.
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface JobRecord<R = unknown> {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number; // 0..1
  createdAt: string;
  updatedAt: string;
  heartbeatAt: string;
  result?: R;
  error?: string;
}

const ALLOWED: Record<JobStatus, JobStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['running', 'succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function createJob(id: string, kind: string, now: string): JobRecord {
  return { id, kind, status: 'queued', progress: 0, createdAt: now, updatedAt: now, heartbeatAt: now };
}

export class JobTransitionError extends Error {}

/** Apply a status/progress change, enforcing the allowed transitions. */
export function transition<R>(
  job: JobRecord<R>,
  next: JobStatus,
  now: string,
  patch: { progress?: number; result?: R; error?: string } = {},
): JobRecord<R> {
  if (job.status !== next && !ALLOWED[job.status].includes(next)) {
    throw new JobTransitionError(`illegal job transition ${job.status} → ${next}`);
  }
  return {
    ...job,
    status: next,
    progress: patch.progress ?? (next === 'succeeded' ? 1 : job.progress),
    updatedAt: now,
    heartbeatAt: now,
    ...(patch.result !== undefined ? { result: patch.result } : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  };
}

export function beat<R>(job: JobRecord<R>, now: string): JobRecord<R> {
  return { ...job, heartbeatAt: now };
}

/** A running job is stale if its heartbeat is older than ttlMs (crashed worker). */
export function isStale(job: JobRecord, nowMs: number, ttlMs: number): boolean {
  return job.status === 'running' && nowMs - Date.parse(job.heartbeatAt) > ttlMs;
}

export const isTerminal = (s: JobStatus): boolean => s === 'succeeded' || s === 'failed' || s === 'cancelled';
