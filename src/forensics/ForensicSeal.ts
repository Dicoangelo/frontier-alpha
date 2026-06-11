/**
 * ForensicSeal (IDEA-FF-4) — signed, independently verifiable receipts.
 *
 * "Backtested CAGR 18.3%" is a worthless claim without a credential. A seal
 * is an Ed25519-signed receipt proving WHEN a result was produced and WHAT
 * (by hash) it contained. Verification is stateless: the receipt carries the
 * public key, so any third party can check it without trusting our database.
 * The "SSL certificate for AI output" framing, from FriendlyFace's
 * seal/service.py.
 *
 * Key management:
 *   - `SEAL_PRIVATE_KEY` env (base64 PKCS8 DER, Ed25519) → keyMode 'persistent'.
 *     Receipts survive process restarts and the public key can be published.
 *   - Absent → an ephemeral keypair is generated at boot (keyMode 'ephemeral').
 *     Receipts remain verifiable against their embedded key, but a restart
 *     means new receipts use a different key. Fine for solo-user phase.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createHash,
  randomUUID,
  type KeyObject,
} from 'node:crypto';
import { canonicalize } from './canonical.js';
import { logger } from '../lib/logger.js';

export type SealSubjectType = 'backtest' | 'insight' | 'performance_report';

export interface SealedReceipt {
  sealId: string;
  subjectType: SealSubjectType;
  issuedAt: string;
  /** SHA-256 of the canonicalized subject. */
  subjectHash: string;
  algorithm: 'Ed25519';
  /** Base64 SPKI DER public key — verification needs nothing else. */
  publicKey: string;
  /** Base64 Ed25519 signature over `sealId|subjectType|issuedAt|subjectHash`. */
  signature: string;
  keyMode: 'persistent' | 'ephemeral';
}

export interface SealVerification {
  valid: boolean;
  /** Human-readable failure reasons; empty when valid. */
  reasons: string[];
  /** True when the receipt was signed by THIS server's current key. */
  signedByThisServer: boolean;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function signingPayload(receipt: Pick<SealedReceipt, 'sealId' | 'subjectType' | 'issuedAt' | 'subjectHash'>): Buffer {
  return Buffer.from(`${receipt.sealId}|${receipt.subjectType}|${receipt.issuedAt}|${receipt.subjectHash}`);
}

export class ForensicSeal {
  private privateKey: KeyObject;
  private publicKeyB64: string;
  readonly keyMode: 'persistent' | 'ephemeral';

  constructor(privateKeyB64?: string) {
    const envKey = privateKeyB64 ?? process.env.SEAL_PRIVATE_KEY;
    if (envKey) {
      this.privateKey = createPrivateKey({
        key: Buffer.from(envKey, 'base64'),
        format: 'der',
        type: 'pkcs8',
      });
      this.keyMode = 'persistent';
    } else {
      const { privateKey } = generateKeyPairSync('ed25519');
      this.privateKey = privateKey;
      this.keyMode = 'ephemeral';
      logger.info(
        'SEAL_PRIVATE_KEY not set — using an ephemeral seal key for this process lifetime',
      );
    }
    this.publicKeyB64 = createPublicKey(this.privateKey)
      .export({ format: 'der', type: 'spki' })
      .toString('base64');
  }

  /** This server's current verification key (base64 SPKI DER). */
  get publicKey(): string {
    return this.publicKeyB64;
  }

  /** Issue a signed receipt over an arbitrary JSON-serializable subject. */
  issue(subjectType: SealSubjectType, subject: unknown): SealedReceipt {
    const base = {
      sealId: randomUUID(),
      subjectType,
      issuedAt: new Date().toISOString(),
      subjectHash: sha256(canonicalize(subject)),
    };
    const signature = cryptoSign(null, signingPayload(base), this.privateKey).toString('base64');
    return {
      ...base,
      algorithm: 'Ed25519',
      publicKey: this.publicKeyB64,
      signature,
      keyMode: this.keyMode,
    };
  }

  /**
   * Verify a receipt. Stateless: checks the signature against the receipt's
   * embedded public key. When `subject` is provided, also recomputes the
   * subject hash — proving the receipt covers THESE numbers, not just any.
   */
  verify(receipt: SealedReceipt, subject?: unknown): SealVerification {
    const reasons: string[] = [];

    let signatureValid = false;
    try {
      const embeddedKey = createPublicKey({
        key: Buffer.from(receipt.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      signatureValid = cryptoVerify(
        null,
        signingPayload(receipt),
        embeddedKey,
        Buffer.from(receipt.signature, 'base64'),
      );
    } catch {
      reasons.push('malformed_receipt');
    }
    if (!signatureValid && reasons.length === 0) {
      reasons.push('signature_invalid');
    }

    if (subject !== undefined) {
      const recomputed = sha256(canonicalize(subject));
      if (recomputed !== receipt.subjectHash) {
        reasons.push('subject_hash_mismatch');
      }
    }

    return {
      valid: reasons.length === 0,
      reasons,
      signedByThisServer: receipt.publicKey === this.publicKeyB64,
    };
  }
}

export const forensicSeal = new ForensicSeal();
