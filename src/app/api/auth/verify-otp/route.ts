// POST /api/auth/verify-otp
// Body: { email: string, code: string }
// 1. Try to verify the OTP.
// 2. If ok: upsert the user with isVerifiedStudent=true, issue a session JWT,
//    set it as an HttpOnly cookie.
// 3. If not ok: return the specific reason (so the UI can show "expired", etc.).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tryVerifyOtp, issueSession, sessionCookieName, sessionCookieMaxAge } from '@/lib/auth/otp';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!email || !code) {
    return NextResponse.json({ ok: false, message: 'Email and code are required.' }, { status: 400 });
  }

  const result = await tryVerifyOtp(email, code);
  if (!result.ok) {
    const message = {
      not_found: 'No active code. Request a new one.',
      expired: 'The code has expired. Request a new one.',
      consumed: 'This code has already been used.',
      too_many_attempts: 'Too many wrong attempts. Request a new code.',
      wrong_otp: 'That code is incorrect.',
    }[result.reason];
    return NextResponse.json({ ok: false, message, reason: result.reason }, { status: 401 });
  }

  // Promote user to verified.
  const user = await db.user.upsert({
    where: { email: result.email },
    update: { isVerifiedStudent: true },
    create: { email: result.email, isVerifiedStudent: true, role: 'student' },
  });

  const token = issueSession({ id: user.id, email: user.email, role: user.role });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      departmentId: user.departmentId,
      level: user.level,
    },
  });
  res.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_DEMO_MODE,
    path: '/',
    maxAge: sessionCookieMaxAge(),
  });
  return res;
}
