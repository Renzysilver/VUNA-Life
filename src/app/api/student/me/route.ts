// GET /api/student/me
// Returns the logged-in student's department, level, and Monday timetable.
// This is the Phase 1 exit-test endpoint: a real student verifies and sees
// their own Monday timetable here.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { listTimetableForUser } from '@/lib/db/academic';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    include: { department: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }

  // Phase 1: hard-code Monday (weekday=1). The timetable view in Phase 2 will
  // let the user pick a day.
  const monday = 1;
  const tt = await listTimetableForUser({
    departmentId: user.departmentId ?? undefined,
    level: user.level ?? undefined,
    weekday: monday,
  });

  return NextResponse.json({
    ok: true,
    student: {
      id: user.id,
      email: user.email,
      emailDomain: user.email?.split('@')[1]?.toLowerCase() ?? '',
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      department: user.department ? {
        code: user.department.code,
        name: user.department.name,
        faculty: user.department.faculty,
      } : null,
      level: user.level,
      isVerifiedStudent: user.isVerifiedStudent,
    },
    mondayTimetable: tt.map((e) => ({
      id: e.id,
      courseCode: e.course.code,
      courseTitle: e.course.title,
      weekday: e.weekday,
      startTime: e.startTime,
      endTime: e.endTime,
      venue: e.venue ? { pin: e.venue.pin, name: e.venue.name, status: e.venue.status } : null,
      lecturer: e.lecturer ? { username: e.lecturer.username } : null,
    })),
  });
}
