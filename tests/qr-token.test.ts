// ==========================================================================
// VUNA Life — tests for src/lib/auth/qr-token.ts
// Run with: bun test tests/qr-token.test.ts
//
// HARD RULE tested: tokens rotate every 10s, signatures are HMAC-verified,
// expired tokens are rejected (replay protection), and tokens from a
// future slot are also rejected (clock-skew protection).
// ==========================================================================
import { test, expect, describe, beforeEach } from 'bun:test';
import {
  signQrToken,
  verifyQrToken,
  slotIndexAt,
  currentQrTokenState,
  markTokenUsed,
  getUsedTokens,
  _clearReplayCacheForTests,
} from '../src/lib/auth/qr-token';

const SESSION_ID = 'test-session-1';
const QR_SEED = 'a'.repeat(64); // 32 bytes hex
const ROT = 10; // 10 seconds

describe('signQrToken + verifyQrToken — round-trip', () => {
  test('a freshly signed token verifies ok', () => {
    const now = Date.now();
    const slot = slotIndexAt(now, ROT);
    const token = signQrToken({ sessionId: SESSION_ID, qrSeed: QR_SEED, slotIndex: slot });
    const r = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sessionId).toBe(SESSION_ID);
      expect(r.slotIndex).toBe(slot);
    }
  });
});

describe('token expiry — previous slot rejected', () => {
  test('a token from 11 seconds ago is expired', () => {
    const now = Date.now();
    const currentSlot = slotIndexAt(now, ROT);
    const previousSlot = currentSlot - 1;
    const token = signQrToken({
      sessionId: SESSION_ID,
      qrSeed: QR_SEED,
      slotIndex: previousSlot,
    });
    const r = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  test('a token verified at the slot start + 9 seconds still verifies ok (same slot)', () => {
    // Use a synthetic time anchored to a slot boundary so the math is clean.
    const slot = 1_000_000; // any slot index
    const slotStart = slot * ROT * 1000; // ms
    const nineSecondsIn = slotStart + 9000; // 9s into the slot — still same slot
    const token = signQrToken({
      sessionId: SESSION_ID,
      qrSeed: QR_SEED,
      slotIndex: slot,
    });
    const r = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: nineSecondsIn,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slotIndex).toBe(slot);
  });
});

describe('future slot — rejected', () => {
  test('a token from the next slot is rejected as future_slot', () => {
    const now = Date.now();
    const currentSlot = slotIndexAt(now, ROT);
    const nextSlot = currentSlot + 1;
    const token = signQrToken({
      sessionId: SESSION_ID,
      qrSeed: QR_SEED,
      slotIndex: nextSlot,
    });
    const r = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('future_slot');
  });
});

describe('signature tampering — bad_signature', () => {
  test('changing the signature makes the token invalid', () => {
    const now = Date.now();
    const slot = slotIndexAt(now, ROT);
    const token = signQrToken({ sessionId: SESSION_ID, qrSeed: QR_SEED, slotIndex: slot });
    const tampered = token.slice(0, -4) + 'AAAA';
    const r = verifyQrToken({
      token: tampered,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  test('swapping the qr_seed in the payload is rejected (signing under one seed, verifying under another)', () => {
    const now = Date.now();
    const slot = slotIndexAt(now, ROT);
    const tokenA = signQrToken({ sessionId: SESSION_ID, qrSeed: QR_SEED, slotIndex: slot });
    // Try to verify with a different seed — should be malformed (payload
    // doesn't match expectedQrSeed).
    const r = verifyQrToken({
      token: tokenA,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: 'b'.repeat(64),
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  test('swapping sessionId is rejected', () => {
    const now = Date.now();
    const slot = slotIndexAt(now, ROT);
    const token = signQrToken({ sessionId: SESSION_ID, qrSeed: QR_SEED, slotIndex: slot });
    const r = verifyQrToken({
      token,
      expectedSessionId: 'other-session',
      expectedQrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
});

describe('malformed tokens', () => {
  test('too few parts', () => {
    const r = verifyQrToken({
      token: 'only.one.part',
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: Date.now(),
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  test('too many parts', () => {
    const r = verifyQrToken({
      token: 'a.b.c.d.e',
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: Date.now(),
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  test('non-numeric slot', () => {
    const r = verifyQrToken({
      token: `${SESSION_ID}.notanumber.${QR_SEED}.sig`,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: Date.now(),
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
});

describe('replay protection', () => {
  beforeEach(() => {
    _clearReplayCacheForTests();
  });

  test('using the same token twice in the same slot is rejected', () => {
    const now = Date.now();
    const slot = slotIndexAt(now, ROT);
    const token = signQrToken({ sessionId: SESSION_ID, qrSeed: QR_SEED, slotIndex: slot });

    // First verification — should pass.
    const r1 = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(r1.ok).toBe(true);

    // Mark it used.
    markTokenUsed({ sessionId: SESSION_ID, token, slotIndex: slot, rotationSeconds: ROT });

    // Second verification — should fail as replayed.
    const r2 = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now + 1000, // 1s later, still same slot
      rotationSeconds: ROT,
      usedTokensInSlot: undefined, // will be looked up by getUsedTokens inside? — actually verify doesn't fetch automatically
    });
    // Note: verifyQrToken itself doesn't fetch the cache; the caller
    // is supposed to pass it. Let's test by passing it explicitly.
    expect(r2.ok).toBe(true); // would pass without the cache being passed

    // Now pass the cache — should be replayed.
    const cache = getUsedTokens(SESSION_ID, slot);
    const r3 = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now + 1000,
      rotationSeconds: ROT,
      usedTokensInSlot: cache,
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.reason).toBe('replayed');
  });

  test('after the slot rotates, the same token from the old slot is expired (not replayed)', () => {
    const now = Date.now();
    const slot = slotIndexAt(now, ROT);
    const token = signQrToken({ sessionId: SESSION_ID, qrSeed: QR_SEED, slotIndex: slot });
    markTokenUsed({ sessionId: SESSION_ID, token, slotIndex: slot, rotationSeconds: ROT });

    // 11 seconds later — new slot.
    const r = verifyQrToken({
      token,
      expectedSessionId: SESSION_ID,
      expectedQrSeed: QR_SEED,
      serverTimeMs: now + 11000,
      rotationSeconds: ROT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });
});

describe('currentQrTokenState', () => {
  test('returns the current token + seconds until next rotation', () => {
    const now = (slotIndexAt(Date.now(), ROT) + 1) * ROT * 1000 - 3000; // 3s before slot boundary
    const state = currentQrTokenState({
      sessionId: SESSION_ID,
      qrSeed: QR_SEED,
      serverTimeMs: now,
      rotationSeconds: ROT,
    });
    expect(state.slotIndex).toBe(slotIndexAt(now, ROT));
    expect(state.secondsUntilRotation).toBeLessThanOrEqual(3);
    expect(state.secondsUntilRotation).toBeGreaterThan(0);
    expect(state.token).toContain(SESSION_ID);
  });

  test('at the slot boundary, secondsUntilRotation is full ROT', () => {
    const slotStart = slotIndexAt(Date.now(), ROT) * ROT * 1000;
    const state = currentQrTokenState({
      sessionId: SESSION_ID,
      qrSeed: QR_SEED,
      serverTimeMs: slotStart,
      rotationSeconds: ROT,
    });
    expect(state.secondsUntilRotation).toBe(ROT);
  });
});
