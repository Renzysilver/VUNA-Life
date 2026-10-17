// POST /api/activities/[buildingId]/do — perform an activity at a building
// Body: { activityType: 'study' | 'eat' | 'checkin' }
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { doActivity, type ActivityType } from '@/lib/activities/activities';

export async function POST(req: NextRequest, ctx: { params: Promise<{ buildingId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }
  const { buildingId } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const activityType = body?.activityType as ActivityType | undefined;
  if (!activityType || !['study', 'eat', 'checkin'].includes(activityType)) {
    return NextResponse.json({ ok: false, message: 'Invalid activityType.' }, { status: 400 });
  }
  const r = await doActivity({
    userId: user.id,
    buildingId,
    activityType,
    ctx: { actorId: user.id, ...getRequestContext(req as unknown as Request) },
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    rewardCC: r.rewardCC,
    xpPath: r.xpPath,
    xpAmount: r.xpAmount,
    newBalance: r.newBalance,
    newTotalXp: r.newTotalXp,
  });
}
