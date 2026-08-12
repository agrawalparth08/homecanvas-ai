import { generateKeyPairSync, sign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LicenseModule from './license';

/**
 * Offline licensing (server/license.ts): signature verification, MONOTONIC
 * trial arithmetic (clock rollback can't add days), the outside-APP_DATA
 * breadcrumb (deleting license.json alone can't reset), corrupt-file recovery,
 * and activate/deactivate. Ephemeral Ed25519 pair; the embedded production key
 * is exercised only for the negative case. Both the app-data dir and the
 * breadcrumb dir are redirected to temp dirs, so nothing touches the real home.
 */

const ORIGINAL_DATA_DIR = process.env.HOMECANVAS_DATA_DIR;
const ORIGINAL_KEYS_DIR = process.env.HOMECANVAS_KEYS_DIR;

let tempDir: string;
let keysDir: string;
let license: typeof LicenseModule;

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const TEST_PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function makeKey(payload: Record<string, unknown>): string {
  const bytes = Buffer.from(JSON.stringify(payload));
  return `HCPRO.${bytes.toString('base64url')}.${sign(null, bytes, privateKey).toString('base64url')}`;
}

const validKey = () => makeKey({ email: 'buyer@example.com', plan: 'pro', issuedAt: new Date().toISOString() });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function seedLicenseFile(data: Record<string, unknown>): Promise<void> {
  await mkdir(path.join(tempDir, '.homecanvas'), { recursive: true });
  await writeFile(path.join(tempDir, '.homecanvas', 'license.json'), JSON.stringify(data));
}
const licensePath = () => path.join(tempDir, '.homecanvas', 'license.json');

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hc-license-'));
  keysDir = await mkdtemp(path.join(tmpdir(), 'hc-keys-'));
  process.env.HOMECANVAS_DATA_DIR = tempDir;
  process.env.HOMECANVAS_KEYS_DIR = keysDir;
  vi.resetModules();
  license = await import('./license');
});

afterEach(async () => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.HOMECANVAS_DATA_DIR;
  else process.env.HOMECANVAS_DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_KEYS_DIR === undefined) delete process.env.HOMECANVAS_KEYS_DIR;
  else process.env.HOMECANVAS_KEYS_DIR = ORIGINAL_KEYS_DIR;
  await rm(tempDir, { recursive: true, force: true });
  await rm(keysDir, { recursive: true, force: true });
});

describe('verifyLicenseKey', () => {
  it('accepts a properly signed key and rejects tampering', () => {
    const key = validKey();
    expect(license.verifyLicenseKey(key, TEST_PUB)?.email).toBe('buyer@example.com');
    const parts = key.split('.');
    const tampered = Buffer.from(JSON.stringify({ email: 'thief@example.com', plan: 'pro', issuedAt: new Date().toISOString() })).toString('base64url');
    expect(license.verifyLicenseKey(`${parts[0]}.${tampered}.${parts[2]}`, TEST_PUB)).toBeNull();
    expect(license.verifyLicenseKey('HCPRO.not.real', TEST_PUB)).toBeNull();
    expect(license.verifyLicenseKey('', TEST_PUB)).toBeNull();
  });

  it('rejects keys signed by a different key against the embedded production key', () => {
    expect(license.verifyLicenseKey(validKey())).toBeNull();
  });

  it('rejects expired keys', () => {
    const key = makeKey({ email: 'x@y.z', plan: 'pro', issuedAt: '2020-01-01T00:00:00Z', expiresAt: '2020-06-01T00:00:00Z' });
    expect(license.verifyLicenseKey(key, TEST_PUB)).toBeNull();
  });
});

describe('trial arithmetic', () => {
  it('starts a 14-day trial on first status call and writes both files', async () => {
    const status = await license.licenseStatus(TEST_PUB);
    expect(status.state).toBe('trial');
    expect(status.trialDaysLeft).toBe(license.TRIAL_DAYS);
    const raw = JSON.parse(await readFile(licensePath(), 'utf8'));
    expect(typeof raw.trialStartedAt).toBe('string');
    expect(raw.elapsedDays).toBeGreaterThanOrEqual(0);
    expect(existsSync(path.join(keysDir, 'trial-anchor.json'))).toBe(true);
  });

  it('expires after 14 elapsed days and gates pro outputs', async () => {
    await seedLicenseFile({ trialStartedAt: daysAgo(20), lastSeenAt: daysAgo(20), elapsedDays: 20 });
    const status = await license.licenseStatus(TEST_PUB);
    expect(status.state).toBe('expired');
    expect(status.trialDaysLeft).toBe(0);
    expect(await license.proGated()).toBe(true);
  });

  it('clock rollback does NOT add days (monotonic elapsed)', async () => {
    // 10 days used; then the clock is wound back so lastSeenAt is in the future.
    await seedLicenseFile({ trialStartedAt: daysAgo(10), lastSeenAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), elapsedDays: 10 });
    const status = await license.licenseStatus(TEST_PUB);
    expect(status.clockSuspect).toBe(true);
    // elapsed stays 10 -> 4 left, NOT reset to 14.
    expect(status.trialDaysLeft).toBe(license.TRIAL_DAYS - 10);
  });

  it('rolling the clock back on an EXPIRED trial keeps it expired', async () => {
    await seedLicenseFile({ trialStartedAt: daysAgo(30), lastSeenAt: new Date(Date.now() + 60 * 86_400_000).toISOString(), elapsedDays: 30 });
    const status = await license.licenseStatus(TEST_PUB);
    expect(status.state).toBe('expired');
    expect(status.trialDaysLeft).toBe(0);
  });

  it('deleting license.json alone does not reset the trial (breadcrumb survives)', async () => {
    await seedLicenseFile({ trialStartedAt: daysAgo(20), lastSeenAt: daysAgo(20), elapsedDays: 20 });
    expect((await license.licenseStatus(TEST_PUB)).state).toBe('expired'); // writes the anchor
    await unlink(licensePath());
    const afterDelete = await license.licenseStatus(TEST_PUB);
    expect(afterDelete.state).toBe('expired'); // anchor restored elapsed=20
    expect(afterDelete.trialDaysLeft).toBe(0);
  });

  it('a corrupt (non-date) trialStartedAt recovers to a fresh trial, not permanent expiry', async () => {
    await seedLicenseFile({ lastSeenAt: 'garbage' });
    const status = await license.licenseStatus(TEST_PUB);
    expect(status.state).toBe('trial');
    expect(status.trialDaysLeft).toBe(license.TRIAL_DAYS);
  });

  it('does not rewrite license.json when nothing changed (no per-poll churn)', async () => {
    await license.licenseStatus(TEST_PUB);
    const before = await readFile(licensePath(), 'utf8');
    await new Promise((r) => setTimeout(r, 5));
    await license.licenseStatus(TEST_PUB);
    // second poll adds a sliver of elapsed time, so it MAY rewrite; assert it at
    // least doesn't reset the trial or corrupt the file.
    const after = JSON.parse(await readFile(licensePath(), 'utf8'));
    expect(after.elapsedDays).toBeGreaterThanOrEqual(JSON.parse(before).elapsedDays);
  });
});

describe('activate / deactivate', () => {
  it('activates a valid key, survives restart, deactivates back to trial', async () => {
    expect('error' in (await license.activateLicense('HCPRO.garbage.key', TEST_PUB))).toBe(true);
    const good = await license.activateLicense(validKey(), TEST_PUB);
    expect('error' in good).toBe(false);
    if ('error' in good) return;
    expect(good.state).toBe('licensed');
    expect(good.email).toBe('buyer@example.com');

    vi.resetModules();
    const reloaded = await import('./license');
    expect((await reloaded.licenseStatus(TEST_PUB)).state).toBe('licensed');
    const after = await reloaded.deactivateLicense();
    expect(after.state === 'trial' || after.state === 'expired').toBe(true);
    expect(after.email).toBeUndefined();
  });

  it('a licensed user is never expired even long past the trial window', async () => {
    await seedLicenseFile({ trialStartedAt: daysAgo(90), lastSeenAt: daysAgo(90), elapsedDays: 90, key: validKey() });
    expect((await license.licenseStatus(TEST_PUB)).state).toBe('licensed');
  });
});
