// POST /api/sessions/[id]/flags — resolve a flagged attendance row
// Body: { attendanceId, decision: 'approve' | 'reject', note? }
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { resolveFlag } from '@/lib/sessions/attendance';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || (user.role !== 'lecturer' && user.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Lecturer access required.' }, { status: 403 });
  }

  const { id: sessionId } = await ctx.params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const attendanceId = typeof body?.attendanceId === 'string' ? body.attendanceId : null;
  const decision = body?.decision === 'approve' ? 'approve' : body?.decision === 'reject' ? 'reject' : null;
  if (!attendanceId || !decision) {
    return NextResponse.json({ ok: false, message: 'attendanceId and decision are required.' }, { status: 400 });
  }
  const note = typeof body?.note === 'string' ? body.note.slice(0, 200) : undefined;

  const result = await resolveFlag({
    attendanceId,
    verifierId: user.id,
    decision,
    note,
    ctx: { actorId: user.id, ...getRequestContext(req as unknown as Request) },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.reason ?? 'Failed' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
