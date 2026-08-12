import { createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_DATA, atomicWrite } from './storage';

/**
 * Offline licensing — local-first, no phone-home. A license key is an
 * Ed25519-signed JSON payload issued by us; the app only ever VERIFIES with
 * the embedded public key, so activation works fully offline. Until a key is
 * entered, the app runs a 14-day trial.
 *
 * Deliberate product choices:
 *  - Editing is never bricked. An ended trial soft-gates the PRO outputs
 *    (client viewer export, batch renders); the user's own data (scenes,
 *    .hcproj bundles) always exports — we don't hold work hostage.
 *  - The trial counts ELAPSED days monotonically: we accumulate real forward
 *    time and never subtract, so winding the system clock backwards can't add
 *    days (a naive now-minus-start recompute would). clockSuspect is reported
 *    for the UI but the arithmetic doesn't depend on it.
 *  - A second breadcrumb outside APP_DATA (the OS home dir) records the trial
 *    anchor, so deleting APP_DATA/license.json alone doesn't mint a fresh
 *    trial. Fully offline licensing can't be tamper-proof; this raises the bar
 *    past "delete one file" without punishing honest users.
 *
 * Key format: HCPRO.<base64url payload JSON>.<base64url signature>
 * Payload: { email, plan: 'pro', issuedAt: ISO, expiresAt?: ISO }
 * (expiresAt absent = perpetual license for that major version.)
 */

export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

// Production verification key (Ed25519 SPKI). The matching PRIVATE key lives at
// ~/.homecanvas-keys/ — OUTSIDE DATA_ROOT so it is never reachable through the
// sidecar's /api/private-home/file route. See scripts/gen-license-key.ts.
const EMBEDDED_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAhLAmJWsWyFdOlVjo1oiKwRE+QfpDAg2F9laSRZOVWGQ=
-----END PUBLIC KEY-----`;

export interface LicensePayload {
  email: string;
  plan: 'pro';
  issuedAt: string;
  expiresAt?: string;
}

interface LicenseFile {
  trialStartedAt: string;
  lastSeenAt: string;
  /** Monotonic accumulated trial days — only ever increases. */
  elapsedDays: number;
  key?: string;
}

export interface LicenseStatus {
  state: 'trial' | 'licensed' | 'expired';
  trialDaysLeft: number;
  email?: string;
  plan?: string;
  /** System clock ran backwards since we last looked — trial frozen, not counted. */
  clockSuspect: boolean;
}

const licenseFilePath = (): string => path.join(APP_DATA, 'license.json');
// Breadcrumb outside APP_DATA (survives deleting the app-data dir). Location is
// overridable for hermetic tests; in production it's the user's home dir.
const keysDir = (): string => process.env['HOMECANVAS_KEYS_DIR'] ?? path.join(os.homedir(), '.homecanvas-keys');
const anchorFilePath = (): string => path.join(keysDir(), 'trial-anchor.json');

interface TrialAnchor {
  trialStartedAt: string;
  elapsedDays: number;
}

function decodeKey(key: string, publicKey: KeyObject): LicensePayload | null {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'HCPRO') return null;
  try {
    const payloadBytes = Buffer.from(parts[1]!, 'base64url');
    const sig = Buffer.from(parts[2]!, 'base64url');
    if (!edVerify(null, payloadBytes, publicKey, sig)) return null;
    const payload = JSON.parse(payloadBytes.toString('utf8')) as LicensePayload;
    if (typeof payload.email !== 'string' || payload.plan !== 'pro') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Parse + signature-check a key. Exposed with an injectable key for tests. */
export function verifyLicenseKey(key: string, publicKeyPem: string = EMBEDDED_PUBLIC_KEY_PEM): LicensePayload | null {
  try {
    const payload = decodeKey(key, createPublicKey(publicKeyPem));
    if (!payload) return null;
    if (payload.expiresAt && Date.parse(payload.expiresAt) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const isValidDate = (s: unknown): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s));

async function readLicenseFile(): Promise<LicenseFile | null> {
  const file = licenseFilePath();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<LicenseFile>;
    // A truncated/corrupt file must NOT permanently expire the app: a missing
    // or non-date trialStartedAt is treated as "no file", starting fresh.
    if (!isValidDate(raw.trialStartedAt)) return null;
    return {
      trialStartedAt: raw.trialStartedAt,
      lastSeenAt: isValidDate(raw.lastSeenAt) ? raw.lastSeenAt : raw.trialStartedAt,
      // Legacy files (pre-monotonic) have no elapsedDays — seed from the span.
      elapsedDays:
        typeof raw.elapsedDays === 'number' && raw.elapsedDays >= 0
          ? raw.elapsedDays
          : Math.max(0, (Date.parse(raw.lastSeenAt ?? raw.trialStartedAt) - Date.parse(raw.trialStartedAt)) / DAY_MS),
      ...(typeof raw.key === 'string' ? { key: raw.key } : {}),
    };
  } catch {
    return null;
  }
}

async function writeLicenseFile(data: LicenseFile): Promise<void> {
  await atomicWrite(licenseFilePath(), JSON.stringify(data, null, 2));
}

async function readAnchor(): Promise<TrialAnchor | null> {
  const file = anchorFilePath();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<TrialAnchor>;
    if (!isValidDate(raw.trialStartedAt)) return null;
    return { trialStartedAt: raw.trialStartedAt, elapsedDays: typeof raw.elapsedDays === 'number' ? raw.elapsedDays : 0 };
  } catch {
    return null;
  }
}

async function writeAnchor(anchor: TrialAnchor): Promise<void> {
  await atomicWrite(anchorFilePath(), JSON.stringify(anchor, null, 2));
}

/** Current license/trial state. First call starts the trial clock. */
export async function licenseStatus(publicKeyPem?: string): Promise<LicenseStatus> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const stored = await readLicenseFile();
  const anchor = await readAnchor();

  // Reconcile the license file with the outside-APP_DATA breadcrumb: earliest
  // start, greatest accumulated elapsed. Deleting license.json can't shrink
  // the trial while the anchor survives.
  const trialStartedAt = [stored?.trialStartedAt, anchor?.trialStartedAt, nowIso]
    .filter(isValidDate)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0]!;
  let elapsedDays = Math.max(stored?.elapsedDays ?? 0, anchor?.elapsedDays ?? 0);

  // Monotonic accrual: add only forward time since we last looked. Winding the
  // clock back adds nothing; lastSeenAt never moves backwards.
  const lastSeenMs = stored ? Date.parse(stored.lastSeenAt) : now;
  const deltaDays = (now - lastSeenMs) / DAY_MS;
  if (deltaDays > 0) elapsedDays += deltaDays;
  const clockSuspect = now < lastSeenMs - 6 * 3600_000;
  const lastSeenAt = now >= lastSeenMs ? nowIso : stored!.lastSeenAt;

  const key = stored?.key;
  const nextFile: LicenseFile = { trialStartedAt, lastSeenAt, elapsedDays, ...(key ? { key } : {}) };
  // Persist only when something actually changed (avoid a disk write per poll).
  if (
    !stored ||
    stored.trialStartedAt !== trialStartedAt ||
    stored.lastSeenAt !== lastSeenAt ||
    stored.elapsedDays !== elapsedDays
  ) {
    await writeLicenseFile(nextFile);
  }
  if (!anchor || anchor.elapsedDays < elapsedDays || Date.parse(anchor.trialStartedAt) > Date.parse(trialStartedAt)) {
    await writeAnchor({ trialStartedAt, elapsedDays }).catch(() => undefined); // best-effort; never block on the breadcrumb
  }

  if (key) {
    const payload = verifyLicenseKey(key, publicKeyPem);
    if (payload) {
      return { state: 'licensed', trialDaysLeft: 0, email: payload.email, plan: payload.plan, clockSuspect };
    }
    // Stored key no longer verifies (e.g. expired subscription) — fall through
    // to trial arithmetic rather than erroring.
  }

  const left = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
  return { state: left > 0 ? 'trial' : 'expired', trialDaysLeft: left, clockSuspect };
}

export async function activateLicense(key: string, publicKeyPem?: string): Promise<LicenseStatus | { error: string }> {
  const payload = verifyLicenseKey(key, publicKeyPem);
  if (!payload) return { error: 'That key is not valid — check for missing characters, or contact support.' };
  const nowIso = new Date().toISOString();
  const file = (await readLicenseFile()) ?? { trialStartedAt: nowIso, lastSeenAt: nowIso, elapsedDays: 0 };
  await writeLicenseFile({ ...file, key: key.trim() });
  return licenseStatus(publicKeyPem);
}

export async function deactivateLicense(): Promise<LicenseStatus> {
  const file = await readLicenseFile();
  if (file?.key) {
    const { key: _key, ...rest } = file;
    await writeLicenseFile(rest);
  }
  return licenseStatus();
}

/** True when pro outputs (viewer export, batch renders) should be gated. */
export async function proGated(): Promise<boolean> {
  return (await licenseStatus()).state === 'expired';
}
