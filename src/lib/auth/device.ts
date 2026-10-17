// ==========================================================================
// VUNA Life — device ID helper
// Each user can only check in from ONE device per session. The device_id
// is a random UUID stored in an HttpOnly cookie, generated server-side on
// the first request that needs it.
//
// The check works like this:
//   1. On first check-in, the user's device_id is recorded on the
//      attendance row (or a separate user_device table).
//   2. On subsequent check-ins for the SAME session, if the device_id
//      differs from the first one, the check-in is REJECTED (one device
//      per account per session).
//   3. Across sessions (e.g. tomorrow's class), a NEW device_id is fine
//      — but if the user starts the session on device A and tries to
//      continue on device B, the check-in is flagged (not blocked —
//      the student might have changed phones, but the lecturer should
//      review it).
// ==========================================================================
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_COOKIE = 'vuna_device_id';
const DEVICE_TTL_DAYS = 30;

/**
 * Read the device_id from the request cookie, or generate + set a new one.
 * Always returns a valid UUID. The cookie is HttpOnly (so JS can't read
 * it — the device_id stays between the browser and the server).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing && isValidUuid(existing)) {
    return existing;
  }
  const fresh = uuidv4();
  store.set(DEVICE_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true',
    path: '/',
    maxAge: DEVICE_TTL_DAYS * 86400,
  });
  return fresh;
}

/**
 * Read the device_id without setting it (returns null if missing).
 * Used for the lecturer's view, where we just want to know if a student's
 * device is "the usual one".
 */
export async function readDeviceId(): Promise<string | null> {
  const store = await cookies();
  const v = store.get(DEVICE_COOKIE)?.value;
  return v && isValidUuid(v) ? v : null;
}

/**
 * Check whether a device_id is the user's "primary" device for a given
 * session. We store the first device_id used per (userId, sessionId) and
 * flag subsequent ones.
 *
 * The actual lookup is against the attendance table (the first
 * attendance row for a session+user records their device_id).
 * This function is just a placeholder for the helper signature.
 */
export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export const DEVICE_COOKIE_NAME = DEVICE_COOKIE;
