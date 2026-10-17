// GET /api/sessions — list today's sessions (any authenticated user)
// POST /api/sessions — lecturer/admin creates a session
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { listSessionsToday, createSession, type SessionType } from '@/lib/sessions/sessions';
import { ensureTodayMassSession } from '@/lib/sessions/mass';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }

  // Ensure today's mass session exists (idempotent, weekends skipped).
  await ensureTodayMassSession();

  const sessions = await listSessionsToday();
  return NextResponse.json({ ok: true, sessions });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || (user.role !== 'lecturer' && user.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Lecturer access required.' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }

  const type = body?.type as SessionType | undefined;
  if (!type || !['class', 'mass', 'event', 'exam'].includes(type)) {
    return NextResponse.json({ ok: false, message: 'Invalid session type.' }, { status: 400 });
  }

  // Parse opens_at + closes_at + duration
  let opensAt: Date;
  let closesAt: Date;
  try {
    if (body?.opensAt && body?.closesAt) {
      opensAt = new Date(body.opensAt);
      closesAt = new Date(body.closesAt);
    } else if (body?.opensAt && body?.durationMinutes) {
      opensAt = new Date(body.opensAt);
      closesAt = new Date(opensAt.getTime() + parseInt(body.durationMinutes, 10) * 60_000);
    } else {
      // Default: opens now, closes in 50 min (a class period)
      opensAt = new Date();
      closesAt = new Date(opensAt.getTime() + 50 * 60_000);
    }
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid opens_at / closes_at.' }, { status: 400 });
  }
  if (closesAt <= opensAt) {
    return NextResponse.json({ ok: false, message: 'closes_at must be after opens_at.' }, { status: 400 });
  }

  // Validate venueId if provided
  let venueId: string | undefined;
  if (body?.venueId) {
    const v = await db.building.findUnique({ where: { id: body.venueId } });
    if (!v) return NextResponse.json({ ok: false, message: 'venue not found.' }, { status: 400 });
    venueId = v.id;
  } else if (body?.venuePin) {
    const v = await db.building.findUnique({ where: { pin: String(body.venuePin) } });
    if (!v) return NextResponse.json({ ok: false, message: `venue pin ${body.venuePin} not found.` }, { status: 400 });
    venueId = v.id;
  }

  // Validate courseId if provided
  let courseId: string | undefined;
  if (body?.courseId) {
    const c = await db.course.findUnique({ where: { id: body.courseId } });
    if (!c) return NextResponse.json({ ok: false, message: 'course not found.' }, { status: 400 });
    courseId = c.id;
  } else if (body?.courseCode) {
    const c = await db.course.findFirst({ where: { code: String(body.courseCode) } });
    if (!c) return NextResponse.json({ ok: false, message: `course ${body.courseCode} not found.` }, { status: 400 });
    courseId = c.id;
  }

  const created = await createSession({
    type,
    courseId,
    venueId,
    lecturerId: user.id,
    opensAt,
    closesAt,
  });

  return NextResponse.json({ ok: true, session: created });
}
