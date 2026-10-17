// POST /api/sessions/[id]/check-in — student check-in
// Body: { token: string }
//
// The student's device_id is read from the cookie (server-side).
// The check-in is anti-cheat-validated server-side (token validity,
// session window, duplicate scan, device id).
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { getOrCreateDeviceId } from '@/lib/auth/device';
import { checkInToSession } from '@/lib/sessions/attendance';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }

  const { id } = await ctx.params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) {
    return NextResponse.json({ ok: false, message: 'token is required.' }, { status: 400 });
  }

  const deviceId = await getOrCreateDeviceId();

  const result = await checkInToSession({
    sessionId: id,
    userId: user.id,
    token,
    deviceId,
    serverTimeMs: Date.now(),
    ctx: { actorId: user.id, ...getRequestContext(req as unknown as Request) },
  });

  if (!result.ok) {
    const messageMap: Record<string, string> = {
      session_not_found: 'Session not found.',
      session_closed: 'This session has closed.',
      session_not_open: 'This session is not open yet.',
      token_invalid: 'Invalid or expired code. Scan the QR again.',
      duplicate_scan: 'You are already checked in for this session.',
      device_mismatch: 'Check-in from a different device is not allowed.',
      user_not_registered: 'You are not registered for this course.',
    };
    return NextResponse.json(
      { ok: false, message: messageMap[result.reason] ?? result.reason, reason: result.reason },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    attendanceId: result.attendanceId,
  });
}
