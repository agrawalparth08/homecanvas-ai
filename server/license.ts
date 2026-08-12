import { createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_DATA, atomicWrite } from './storage';

/**
 * Offline licensing — local-first, no phone-home. A license key is an
 * Ed25519-signed JSON payload issued by us; the app only ever VERIFIES with
 * the embedded public key, so activation works fully offline. Until a key is
 * entered, the app runs a 14-day trial tracked in APP_DATA/license.json.
 *
 * Deliberate product choices:
 *  - Editing is never bricked. An ended trial soft-gates the PRO outputs
 *    (client viewer export, batch renders); the user's own data (scenes,
 *    .hcproj bundles) always exports — we don't hold work hostage.
 *  - Clock rollback is detected (lastSeenAt runs backwards), not punished:
 *    the state reports clockSuspect and the trial simply doesn't count down.
 *
 * Key format: HCPRO.<base64url payload JSON>.<base64url signature>
 * Payload: { email, plan: 'pro', issuedAt: ISO, expiresAt?: ISO }
 * (expiresAt absent = perpetual license for that major version.)
 */

export const TRIAL_DAYS = 14;

// Production verification key (Ed25519 SPKI). The matching private key lives
// OUTSIDE the repo (private-home-inputs/license-keys/, gitignored) — see
// scripts/gen-license-key.ts.
const EMBEDDED_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAe9Ym7f8TEDbE2EiBn6HMOBDsM2EuSnchUJPV9gz804k=
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

async function readLicenseFile(): Promise<LicenseFile | null> {
  const file = licenseFilePath();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8')) as LicenseFile;
  } catch {
    return null;
  }
}

async function writeLicenseFile(data: LicenseFile): Promise<void> {
  await atomicWrite(licenseFilePath(), JSON.stringify(data, null, 2));
}

/** Current license/trial state. First call starts the trial clock. */
export async function licenseStatus(publicKeyPem?: string): Promise<LicenseStatus> {
  const now = Date.now();
  let file = await readLicenseFile();
  if (!file) {
    file = { trialStartedAt: new Date(now).toISOString(), lastSeenAt: new Date(now).toISOString() };
    await writeLicenseFile(file);
  }

  // Clock rollback: now noticeably earlier than the last time we looked.
  const clockSuspect = now < Date.parse(file.lastSeenAt) - 6 * 3600_000;
  if (!clockSuspect) {
    await writeLicenseFile({ ...file, lastSeenAt: new Date(now).toISOString() });
  }

  if (file.key) {
    const payload = verifyLicenseKey(file.key, publicKeyPem);
    if (payload) {
      return { state: 'licensed', trialDaysLeft: 0, email: payload.email, plan: payload.plan, clockSuspect };
    }
    // Stored key no longer verifies (e.g. expired subscription) — fall through
    // to trial arithmetic rather than erroring.
  }

  const elapsedDays = clockSuspect ? 0 : (now - Date.parse(file.trialStartedAt)) / 86_400_000;
  const left = Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
  return { state: left > 0 ? 'trial' : 'expired', trialDaysLeft: left, clockSuspect };
}

export async function activateLicense(key: string, publicKeyPem?: string): Promise<LicenseStatus | { error: string }> {
  const payload = verifyLicenseKey(key, publicKeyPem);
  if (!payload) return { error: 'That key is not valid — check for missing characters, or contact support.' };
  const file = (await readLicenseFile()) ?? {
    trialStartedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
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
