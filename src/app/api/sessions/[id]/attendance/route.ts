// GET /api/sessions/[id]/attendance — list check-ins (lecturer view)
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { listSessionAttendance } from '@/lib/sessions/attendance';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || (user.role !== 'lecturer' && user.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Lecturer access required.' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const rows = await listSessionAttendance(id);
  return NextResponse.json({ ok: true, attendance: rows });
}
