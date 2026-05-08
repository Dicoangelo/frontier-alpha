/**
 * AES-256-GCM encryption for at-rest broker credentials.
 *
 * Envelope format: `<iv-hex>:<auth-tag-hex>:<ciphertext-hex>`
 *
 * The 32-byte (64 hex char) key lives in the BROKER_CRED_ENC_KEY env var.
 * Generate via:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If the key rotates, in-place re-encryption needs a per-row migration —
 * not handled in v1. For v1, treat key rotation as a manual ops task
 * that re-prompts users to reconnect.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

function getKey(): Buffer {
  const hex = process.env.BROKER_CRED_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'BROKER_CRED_ENC_KEY must be set to a 64-char hex string (32 bytes). ' +
        'Generate via `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':');
}

export function decrypt(envelope: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 3) {
    throw new Error('malformed envelope — expected iv:tag:ciphertext');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Best-effort sanity check before letting an encryption-dependent flow run.
 * Returns true when the env is configured AND a round-trip succeeds.
 */
export function isCryptoReady(): boolean {
  try {
    const probe = `probe-${Date.now()}`;
    return decrypt(encrypt(probe)) === probe;
  } catch {
    return false;
  }
}
