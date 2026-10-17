// POST /api/auth/verify-otp
// Body: { email: string, code: string }
// 1. Try to verify the OTP.
// 2. If ok: upsert the user with isVerifiedStudent=true, issue a session JWT,
//    set it as an HttpOnly cookie, AND return the full dashboard payload
//    (department + Monday timetable) in the response so the page can render
//    the dashboard immediately — no second fetch that races against the
//    cookie being committed through the preview gateway.
// 3. If not ok: return the specific reason (so the UI can show "expired", etc.).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tryVerifyOtp, issueSession, sessionCookieName, sessionCookieMaxAge } from '@/lib/auth/otp';
import { listTimetableForUser } from '@/lib/db/academic';

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

  // Promote user to verified + load department in one query.
  const user = await db.user.upsert({
    where: { email: result.email },
    update: { isVerifiedStudent: true },
    create: { email: result.email, isVerifiedStudent: true, role: 'student' },
    include: { department: true },
  });

  const token = issueSession({ id: user.id, email: user.email, role: user.role });

  // Load Monday timetable so the dashboard has it without a follow-up fetch.
  // Phase 1 hard-codes Monday (weekday=1); Phase 2 will let the user pick a day.
  const monday = 1;
  const tt = await listTimetableForUser({
    departmentId: user.departmentId ?? undefined,
    level: user.level ?? undefined,
    weekday: monday,
  });

  // Detect whether the request came through HTTPS so we set Secure correctly.
  // The preview gateway is HTTPS; local dev is HTTP. We can't rely on
  // NODE_ENV because dev mode runs the preview through HTTPS too.
  const xForwardedProto = req.headers.get('x-forwarded-proto') ?? '';
  const isHttps = xForwardedProto.includes('https');

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      emailDomain: user.email.split('@')[1]?.toLowerCase() ?? '',
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      departmentId: user.departmentId,
      level: user.level,
      isVerifiedStudent: user.isVerifiedStudent,
      isBeta: user.isBeta,
      avatarPath: user.avatarPath,
    },
    department: user.department
      ? {
          code: user.department.code,
          name: user.department.name,
          faculty: user.department.faculty,
        }
      : null,
    mondayTimetable: tt.map((e) => ({
      id: e.id,
      courseCode: e.course.code,
      courseTitle: e.course.title,
      weekday: e.weekday,
      startTime: e.startTime,
      endTime: e.endTime,
      venue: e.venue
        ? { pin: e.venue.pin, name: e.venue.name, status: e.venue.status }
        : null,
      lecturer: e.lecturer ? { username: e.lecturer.username } : null,
    })),
  });
  res.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: sessionCookieMaxAge(),
  });
  return res;
}
