// POST /api/goals/[id]/complete — mark a user_goal as completed.
// Posts a goal_reward ledger entry (subject to daily earning cap) and
// bumps the relevant stat. Idempotent (no double reward).
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { completeGoal } from '@/lib/db/goals';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }

  const { id } = await ctx.params;

  // Verify the goal belongs to the user.
  const ug = await db.userGoal.findUnique({ where: { id }, include: { goal: true } });
  if (!ug || ug.userId !== user.id) {
    return NextResponse.json({ ok: false, message: 'Goal not found.' }, { status: 404 });
  }

  const result = await completeGoal(id, {
    actorId: user.id,
    ...getRequestContext(_req as unknown as Request),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.reason ?? 'Failed' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
