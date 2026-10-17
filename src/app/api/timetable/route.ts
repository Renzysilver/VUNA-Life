// GET /api/timetable — full week grid for the logged-in student.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }

  // Pull all timetable entries for the student's department+level.
  // We don't filter by weekday here — we want the whole week.
  const rows = await db.timetable.findMany({
    where: {
      departmentId: user.departmentId ?? undefined,
      level: user.level ?? undefined,
    },
    include: {
      course: { include: { department: true } },
      venue: true,
      lecturer: true,
    },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });

  const now = new Date();
  const todayWeekday = now.getDay();

  return NextResponse.json({
    ok: true,
    todayWeekday,
    entries: rows.map((e) => ({
      id: e.id,
      weekday: e.weekday,
      courseCode: e.course.code,
      courseTitle: e.course.title,
      startTime: e.startTime,
      endTime: e.endTime,
      venue: e.venue
        ? { pin: e.venue.pin, name: e.venue.name, status: e.venue.status, category: e.venue.category }
        : null,
      lecturer: e.lecturer ? { username: e.lecturer.username } : null,
    })),
  });
}
