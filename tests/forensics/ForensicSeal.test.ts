/**
 * Tests for ForensicSeal (IDEA-FF-4).
 *
 * The invariant: a receipt is verifiable STATELESSLY (embedded public key),
 * binds to the exact subject (canonical hash), and any tampering — with the
 * subject, the receipt fields, or the signature — fails verification.
 */

import { describe, it, expect } from 'vitest';
import { ForensicSeal } from '../../src/forensics/ForensicSeal.js';

const SUBJECT = {
  config: { symbols: ['NVDA', 'AAPL'], strategy: 'max_sharpe' },
  result: { cagr: 0.183, sharpe: 1.42, maxDrawdown: -0.21 },
};

describe('ForensicSeal', () => {
  it('issues a receipt that verifies against the same subject', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('backtest', SUBJECT);

    expect(receipt.algorithm).toBe('Ed25519');
    expect(receipt.keyMode).toBe('ephemeral');

    const result = seal.verify(receipt, SUBJECT);
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.signedByThisServer).toBe(true);
  });

  it('canonicalization makes key order irrelevant to the subject hash', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('backtest', SUBJECT);
    const reordered = {
      result: { maxDrawdown: -0.21, sharpe: 1.42, cagr: 0.183 },
      config: { strategy: 'max_sharpe', symbols: ['NVDA', 'AAPL'] },
    };
    expect(seal.verify(receipt, reordered).valid).toBe(true);
  });

  it('detects subject tampering', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('backtest', SUBJECT);
    const inflated = { ...SUBJECT, result: { ...SUBJECT.result, cagr: 0.483 } };

    const result = seal.verify(receipt, inflated);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('subject_hash_mismatch');
  });

  it('detects receipt field tampering (signature covers issuedAt)', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('backtest', SUBJECT);
    const backdated = { ...receipt, issuedAt: '2020-01-01T00:00:00.000Z' };

    const result = seal.verify(backdated, SUBJECT);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('signature_invalid');
  });

  it('detects a forged signature', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('backtest', SUBJECT);
    const forged = { ...receipt, signature: Buffer.alloc(64).toString('base64') };

    expect(seal.verify(forged, SUBJECT).valid).toBe(false);
  });

  it('verifies receipts from another server (stateless) but flags the key', () => {
    const issuer = new ForensicSeal();
    const verifier = new ForensicSeal(); // different ephemeral key
    const receipt = issuer.issue('insight', { text: 'momentum rose' });

    const result = verifier.verify(receipt, { text: 'momentum rose' });
    expect(result.valid).toBe(true);
    expect(result.signedByThisServer).toBe(false);
  });

  it('handles malformed receipts without throwing', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('backtest', SUBJECT);
    const malformed = { ...receipt, publicKey: 'not-base64-der!!!' };

    const result = seal.verify(malformed, SUBJECT);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('malformed_receipt');
  });

  it('verifies without a subject (signature-only check)', () => {
    const seal = new ForensicSeal();
    const receipt = seal.issue('performance_report', { q: 'Q2-2026', return: 0.07 });
    expect(seal.verify(receipt).valid).toBe(true);
  });
});
