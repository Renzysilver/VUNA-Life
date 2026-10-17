// ==========================================================================
// VUNA Life — rotating signed QR tokens for attendance
//
// The lecturer's screen shows a QR code that rotates every N seconds
// (config: qr_rotation_seconds, default 10). Each token is:
//
//   payload = `${sessionId}.${slotIndex}.${qrSeed}`
//   sig     = HMAC-SHA256(payload, JWT_SECRET)  (first 16 bytes, base64url)
//   token   = `${payload}.${sig}`
//
// where slotIndex = floor(unixTime / rotationSeconds). The server validates:
//   - The signature matches (sig is correct for the payload)
//   - The slotIndex is the CURRENT slot OR within a 1-slot grace window
//     (a token from the previous slot is rejected as a replay)
//
// Replay protection: in DEMO_MODE we keep an in-memory Set of (token)
// already-used in the current slot, cleared when the slot rotates. In
// production with Upstash Redis configured, this would be a Redis SET
// with TTL = rotationSeconds.
//
// CRITICAL: all time math uses server time (Date.now()), never the client
// clock. The check-in API never trusts a client-provided timestamp.
// ==========================================================================
import crypto from 'crypto';

const DEFAULT_ROTATION_SECONDS = 10;

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return 'demo-mode-secret-never-use-in-prod-xxxxxxxx';
    }
    throw new Error('JWT_SECRET env var is required in production.');
  }
  return s;
}

/**
 * Compute the current slot index for a given time + rotation period.
 * Slot indexes are integers; they increment every `rotationSeconds`.
 * Returns the slot index valid at the given timestamp.
 */
export function slotIndexAt(unixTimeMs: number, rotationSeconds: number = DEFAULT_ROTATION_SECONDS): number {
  return Math.floor(unixTimeMs / 1000 / rotationSeconds);
}

/**
 * Sign a QR token for a session at a specific slot.
 * Pure function — no side effects, no time dependency. Testable.
 */
export function signQrToken(opts: {
  sessionId: string;
  qrSeed: string;
  slotIndex: number;
}): string {
  const payload = `${opts.sessionId}.${opts.slotIndex}.${opts.qrSeed}`;
  const sig = crypto.createHmac('sha256', jwtSecret())
    .update(payload)
    .digest('base64url')
    .slice(0, 22); // 22 chars of base64url ≈ 16 bytes of entropy
  return `${payload}.${sig}`;
}

export type VerifyResult =
  | { ok: true; sessionId: string; slotIndex: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'future_slot' | 'replayed' };

/**
 * Verify a QR token against a session + the current server time.
 *
 * - `serverTimeMs` is the current server time. ALWAYS pass Date.now() in
 *   production code; tests can pass a fixed time for determinism.
 * - `expectedSessionId` must match the session being checked in to.
 * - `expectedQrSeed` is the session's qr_seed from the DB.
 * - `rotationSeconds` is the rotation period (default 10).
 * - `usedTokensInSlot` is the set of tokens already used in the current
 *   slot (for replay protection). Pass a Set<string> from the caller;
 *   the function checks membership but does not mutate.
 *
 * Acceptance criteria (per the design doc + Builder Pack):
 *   1. Token shape: `${sessionId}.${slotIndex}.${qrSeed}.${sig}`
 *   2. Signature must match HMAC over the payload
 *   3. Slot must be the CURRENT slot (no past or future slots)
 *      — a token from the previous slot is 'expired' (replay protection)
 *   4. Token must not already be in the usedTokensInSlot set
 */
export function verifyQrToken(opts: {
  token: string;
  expectedSessionId: string;
  expectedQrSeed: string;
  serverTimeMs: number;
  rotationSeconds?: number;
  usedTokensInSlot?: Set<string>;
}): VerifyResult {
  const parts = opts.token.split('.');
  if (parts.length !== 4) {
    return { ok: false, reason: 'malformed' };
  }
  const [sessionId, slotStr, qrSeed, sig] = parts;
  const slotIndex = parseInt(slotStr, 10);
  if (isNaN(slotIndex) || sessionId !== opts.expectedSessionId || qrSeed !== opts.expectedQrSeed) {
    return { ok: false, reason: 'malformed' };
  }

  // Recompute signature and compare.
  const expectedSig = crypto.createHmac('sha256', jwtSecret())
    .update(`${sessionId}.${slotIndex}.${qrSeed}`)
    .digest('base64url')
    .slice(0, 22);
  if (sig !== expectedSig) {
    return { ok: false, reason: 'bad_signature' };
  }

  // Check slot is the current one.
  const rot = opts.rotationSeconds ?? DEFAULT_ROTATION_SECONDS;
  const currentSlot = slotIndexAt(opts.serverTimeMs, rot);
  if (slotIndex < currentSlot) {
    return { ok: false, reason: 'expired' };
  }
  if (slotIndex > currentSlot) {
    return { ok: false, reason: 'future_slot' };
  }

  // Replay protection: a token used before in this slot is rejected.
  if (opts.usedTokensInSlot?.has(opts.token)) {
    return { ok: false, reason: 'replayed' };
  }

  return { ok: true, sessionId, slotIndex };
}

/**
 * For the lecturer's screen: compute the current token + when it next
 * rotates (seconds from now until the next slot boundary).
 */
export function currentQrTokenState(opts: {
  sessionId: string;
  qrSeed: string;
  serverTimeMs?: number;
  rotationSeconds?: number;
}): { token: string; slotIndex: number; secondsUntilRotation: number } {
  const now = opts.serverTimeMs ?? Date.now();
  const rot = opts.rotationSeconds ?? DEFAULT_ROTATION_SECONDS;
  const slot = slotIndexAt(now, rot);
  const nextSlotStartsAt = (slot + 1) * rot * 1000;
  const secondsUntilRotation = Math.max(0, Math.ceil((nextSlotStartsAt - now) / 1000));
  return {
    token: signQrToken({ sessionId: opts.sessionId, qrSeed: opts.qrSeed, slotIndex: slot }),
    slotIndex: slot,
    secondsUntilRotation,
  };
}

// ── In-memory replay cache (DEMO_MODE only) ─────────────────────────────
// Map: sessionId → { slotIndex: number, used: Set<string> }
// In production with Redis configured, this would be a Redis SET
// per (sessionId, slotIndex) with TTL = rotationSeconds.

const replayCache = new Map<string, { slotIndex: number; used: Set<string> }>();

/**
 * Mark a token as used for the current slot. Idempotent.
 * Rotates the cache when the slot boundary is crossed.
 */
export function markTokenUsed(opts: {
  sessionId: string;
  token: string;
  slotIndex: number;
  rotationSeconds?: number;
}): void {
  const existing = replayCache.get(opts.sessionId);
  if (!existing || existing.slotIndex !== opts.slotIndex) {
    // New slot — reset the cache.
    replayCache.set(opts.sessionId, {
      slotIndex: opts.slotIndex,
      used: new Set([opts.token]),
    });
    return;
  }
  existing.used.add(opts.token);
}

/**
 * Get the in-memory used-tokens set for a session+slot. Returns undefined
 * if no tokens have been used in this slot yet.
 */
export function getUsedTokens(sessionId: string, slotIndex: number): Set<string> | undefined {
  const entry = replayCache.get(sessionId);
  if (!entry || entry.slotIndex !== slotIndex) return undefined;
  return entry.used;
}

/**
 * For tests: clear the in-memory replay cache.
 */
export function _clearReplayCacheForTests(): void {
  replayCache.clear();
}
