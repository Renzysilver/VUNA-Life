// POST /api/day-summary/today — generate today's day summary card for the user
// Returns the share token + payload. Idempotent (re-call returns same token).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { generateTodayDaySummary } from '@/lib/economy/day-summary';

export async function POST() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }

  const r = await generateTodayDaySummary(user.id);
  return NextResponse.json({
    ok: true,
    shareToken: r.shareToken,
    payload: r.payload,
    // For convenience, the share URL: ?token=shareToken
    shareUrl: `/api/day-summary/${r.shareToken}`,
  });
}
