import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { buildSampleHome } from '../lib/fixtures/sample-home';
import { doneFile, responseFile } from '../lib/agent/bridge-protocol';
import { BRIDGE_DIR, listPending, readResult, writeRequest } from './bridge';
import { atomicWrite } from './storage';

const ONE_HOUR = 1000 * 60 * 60;

beforeEach(() => {
  process.env['HOMECANVAS_ENABLE_BRIDGE'] = '1';
});
afterEach(async () => {
  await rm(BRIDGE_DIR, { recursive: true, force: true });
  delete process.env['HOMECANVAS_ENABLE_BRIDGE'];
});

async function dropResponse(id: string, contentHash: string, withDone: boolean): Promise<void> {
  const resp = { schemaVersion: 1, requestId: id, contentHash, proposals: [] };
  await atomicWrite(path.join(BRIDGE_DIR, responseFile(id)), JSON.stringify(resp));
  if (withDone) await atomicWrite(path.join(BRIDGE_DIR, doneFile(id)), '');
}

describe('bridge file exchange', () => {
  it('stays pending until the .done marker, then is ready and consumed once', async () => {
    const now = Date.now();
    const { id, contentHash } = await writeRequest({ message: 'paint the kitchen', scene: buildSampleHome(), now });

    expect((await readResult(id, now)).status).toBe('pending');

    // response present but NO marker yet -> still pending (race-proof read)
    await dropResponse(id, contentHash, false);
    expect((await readResult(id, now)).status).toBe('pending');

    // marker written last -> ready
    await dropResponse(id, contentHash, true);
    expect((await readResult(id, now)).status).toBe('ready');

    // consumed: a second read finds nothing
    expect((await readResult(id, now)).status).toBe('unknown');
  });

  it('rejects a response whose contentHash does not match the request (stale scene)', async () => {
    const now = Date.now();
    const { id } = await writeRequest({ message: 'x', scene: buildSampleHome(), now });
    await dropResponse(id, 'deadbeef', true);
    const r = await readResult(id, now);
    expect(r.status).toBe('error');
  });

  it('sweeps a request that expired before a response arrived', async () => {
    const past = Date.now() - ONE_HOUR;
    const { id } = await writeRequest({ message: 'x', scene: buildSampleHome(), now: past });
    expect((await readResult(id, Date.now())).status).toBe('error');
    expect(await listPending(Date.now())).toHaveLength(0);
  });

  it('reports disabled when the flag is off', async () => {
    delete process.env['HOMECANVAS_ENABLE_BRIDGE'];
    expect((await readResult('some-valid-id', Date.now())).status).toBe('disabled');
  });

  it('lists a pending request for the human CLI', async () => {
    const now = Date.now();
    await writeRequest({ message: 'make it cosy', scene: buildSampleHome(), now });
    const pending = await listPending(now);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.message).toBe('make it cosy');
  });
});
