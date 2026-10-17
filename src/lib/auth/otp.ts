// ==========================================================================
// VUNA Life — OTP generation + verification
// In DEMO_MODE: OTP is always '123456' and is returned to the caller so the
// UI can display it. (DEMO_MODE is local dev only; in production the OTP is
// random 6-digit and sent via Supabase Auth.)
//
// Either way: OTP is stored as a bcrypt hash in the `verification` table with
// an expiry and attempt cap. Replays are impossible (consumed=true after use).
// ==========================================================================
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { IS_DEMO_MODE } from '@/lib/supabase';

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const DEMO_OTP = '123456';

function random6Digit(): string {
  // 6-digit decimal string, no leading-zero issue (Math.floor gives 0..899999).
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function generateOtp(): { code: string; isDemo: boolean } {
  if (IS_DEMO_MODE) return { code: DEMO_OTP, isDemo: true };
  return { code: random6Digit(), isDemo: false };
}

export async function createVerification(
  email: string,
  ip?: string | null,
  userAgent?: string | null,
): Promise<{ id: string; code: string; isDemo: boolean; expiresAt: Date }> {
  const { code, isDemo } = generateOtp();
  const otpHash = bcrypt.hashSync(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  const v = await db.verification.create({
    data: { email, otpHash, expiresAt, ip: ip ?? null, userAgent: userAgent ?? null },
  });
  return { id: v.id, code, isDemo, expiresAt };
}

export type VerifyResult =
  | { ok: true; email: string; verificationId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'consumed' | 'too_many_attempts' | 'wrong_otp' };

export async function tryVerifyOtp(email: string, code: string): Promise<VerifyResult> {
  const rows = await db.verification.findMany({
    where: { email, consumed: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  if (rows.length === 0) return { ok: false, reason: 'not_found' };

  // Use the most recent valid (non-expired) one.
  const now = new Date();
  const candidate = rows.find((r) => r.expiresAt > now) ?? rows[0];
  if (candidate.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (candidate.attempts >= OTP_MAX_ATTEMPTS)
    return { ok: false, reason: 'too_many_attempts' };

  // Bump attempts first to prevent a race.
  await db.verification.update({
    where: { id: candidate.id },
    data: { attempts: { increment: 1 } },
  });

  const ok = bcrypt.compareSync(code, candidate.otpHash);
  if (!ok) return { ok: false, reason: 'wrong_otp' };

  await db.verification.update({
    where: { id: candidate.id },
    data: { consumed: true },
  });

  return { ok: true, email, verificationId: candidate.id };
}

// ---------- session cookie (signed JWT, HttpOnly, SameSite=Lax) ----------
import jwt from 'jsonwebtoken';

const JWT_COOKIE = 'vuna_session';
const SESSION_TTL_DAYS = 7;

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (IS_DEMO_MODE) return 'demo-mode-secret-never-use-in-prod-' + 'x'.repeat(16);
    throw new Error('JWT_SECRET env var is required in production.');
  }
  return s;
}

export type SessionClaims = {
  sub: string;           // user id
  email: string;
  emailDomain: string;
  role: string;
  iat: number;
  exp: number;
};

export function issueSession(user: { id: string; email: string; role: string }): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 86400;
  const emailDomain = user.email.split('@')[1]?.toLowerCase() ?? '';
  const claims: Omit<SessionClaims, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    emailDomain,
    role: user.role,
  };
  return jwt.sign(claims, jwtSecret(), { algorithm: 'HS256', expiresIn: `${SESSION_TTL_DAYS}d` });
}

export function verifySession(token: string | undefined | null): SessionClaims | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret()) as SessionClaims;
    if (!decoded.sub || !decoded.email) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function sessionCookieName() {
  return JWT_COOKIE;
}

export function sessionCookieMaxAge() {
  return SESSION_TTL_DAYS * 86400;
}
