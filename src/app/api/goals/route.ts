// GET /api/goals — today's goals (assigns if not yet assigned today)
// POST /api/goals — alias for ensureTodaysGoals so the Home screen can force-refresh
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { ensureTodaysGoals } from '@/lib/db/goals';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }
  const result = await ensureTodaysGoals(user.id);
  return NextResponse.json({ ok: true, ...result });
}
