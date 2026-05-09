/**
 * Unit Test: AES-256-GCM at-rest encryption (v1.2.0 Connect Alpaca)
 *
 * Locks in the contract for `src/lib/crypto.ts`:
 * - Round-trip preserves arbitrary plaintext
 * - Each call produces a fresh IV (no two ciphertexts match)
 * - Tampering with any byte fails authentication
 * - Malformed envelope is rejected, not silently decrypted
 * - Missing or wrong-length key throws on probe
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_KEY = 'a'.repeat(64); // 32 bytes hex

describe('crypto.ts — broker credential AES-256-GCM', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.BROKER_CRED_ENC_KEY;
    process.env.BROKER_CRED_ENC_KEY = VALID_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.BROKER_CRED_ENC_KEY;
    else process.env.BROKER_CRED_ENC_KEY = originalKey;
  });

  it('encrypt + decrypt round-trips plaintext', async () => {
    const { encrypt, decrypt } = await import('../../src/lib/crypto.js');
    const pt = 'PKDS-1234567890ABCDEFGHIJKLMNOP';
    expect(decrypt(encrypt(pt))).toBe(pt);
  });

  it('round-trips across edge cases (empty, unicode, long)', async () => {
    const { encrypt, decrypt } = await import('../../src/lib/crypto.js');
    const cases = ['', 'abc', '🔐 secret with emoji', 'x'.repeat(10_000)];
    for (const pt of cases) {
      expect(decrypt(encrypt(pt))).toBe(pt);
    }
  });

  it('produces a fresh IV per call — same plaintext yields different envelopes', async () => {
    const { encrypt } = await import('../../src/lib/crypto.js');
    const pt = 'identical-input';
    const e1 = encrypt(pt);
    const e2 = encrypt(pt);
    expect(e1).not.toBe(e2);
    // Format: iv:tag:ciphertext (3 hex segments)
    expect(e1.split(':')).toHaveLength(3);
    expect(e2.split(':')).toHaveLength(3);
  });

  it('rejects a tampered ciphertext as authentication failure', async () => {
    const { encrypt, decrypt } = await import('../../src/lib/crypto.js');
    const env = encrypt('intact');
    // Flip one bit in the ciphertext segment
    const [iv, tag, ct] = env.split(':');
    const flipped = (ct[0] === '0' ? '1' : '0') + ct.slice(1);
    expect(() => decrypt([iv, tag, flipped].join(':'))).toThrow();
  });

  it('rejects a malformed envelope shape', async () => {
    const { decrypt } = await import('../../src/lib/crypto.js');
    expect(() => decrypt('only-one-segment')).toThrow(/malformed envelope/);
    expect(() => decrypt('iv:tag')).toThrow(/malformed envelope/);
    expect(() => decrypt('iv:tag:ct:extra')).toThrow(/malformed envelope/);
  });

  it('isCryptoReady returns true when env is set and round-trip succeeds', async () => {
    const { isCryptoReady } = await import('../../src/lib/crypto.js');
    expect(isCryptoReady()).toBe(true);
  });

  it('isCryptoReady returns false when key is missing', async () => {
    delete process.env.BROKER_CRED_ENC_KEY;
    vi.resetModules();
    const { isCryptoReady } = await import('../../src/lib/crypto.js');
    expect(isCryptoReady()).toBe(false);
  });

  it('isCryptoReady returns false when key length is wrong', async () => {
    process.env.BROKER_CRED_ENC_KEY = 'too-short';
    vi.resetModules();
    const { isCryptoReady } = await import('../../src/lib/crypto.js');
    expect(isCryptoReady()).toBe(false);
  });

  it('decrypt with wrong key (different envelope) fails authentication', async () => {
    const { encrypt } = await import('../../src/lib/crypto.js');
    const env = encrypt('payload');
    // Rotate key and reload module so getKey reads the new value.
    process.env.BROKER_CRED_ENC_KEY = 'b'.repeat(64);
    vi.resetModules();
    const { decrypt: decryptB } = await import('../../src/lib/crypto.js');
    expect(() => decryptB(env)).toThrow();
  });
});
