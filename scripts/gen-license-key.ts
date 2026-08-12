/**
 * Issue a HomeCanvas Pro license key (run by US after a sale, never shipped in
 * the app). Signs with the Ed25519 private key kept OUTSIDE the repo.
 *
 *   npx tsx scripts/gen-license-key.ts buyer@example.com            # perpetual
 *   npx tsx scripts/gen-license-key.ts buyer@example.com 2027-12-31 # expiring
 *
 * Prints the HCPRO.<payload>.<sig> key to paste into the app's License dialog
 * (or email to the buyer). Razorpay flow: buyer pays via the payment link →
 * we get the email from the Razorpay dashboard → run this → send the key.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KEY_PATH = path.resolve(
  import.meta.dirname,
  '..',
  'private-home-inputs',
  'license-keys',
  'homecanvas-license-signing.pem',
);

function main(): void {
  const email = process.argv[2];
  const expires = process.argv[3];
  if (!email || !email.includes('@')) {
    console.error('usage: npx tsx scripts/gen-license-key.ts <buyer-email> [expires YYYY-MM-DD]');
    process.exit(1);
  }
  if (expires && Number.isNaN(Date.parse(expires))) {
    console.error(`"${expires}" is not a date`);
    process.exit(1);
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(readFileSync(KEY_PATH, 'utf8'));
  } catch {
    console.error(`Signing key not found at ${KEY_PATH} — this only runs on the machine that holds it.`);
    process.exit(1);
  }

  const payload = {
    email,
    plan: 'pro' as const,
    issuedAt: new Date().toISOString(),
    ...(expires ? { expiresAt: new Date(`${expires}T23:59:59Z`).toISOString() } : {}),
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  const sig = sign(null, payloadBytes, privateKey);
  console.log(`HCPRO.${payloadBytes.toString('base64url')}.${sig.toString('base64url')}`);
}

main();
