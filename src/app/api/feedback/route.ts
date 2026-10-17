// POST /api/feedback — submit feedback (140-char limit, 24h rate limit)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { submitFeedback, FEEDBACK_CATEGORIES } from '@/lib/social/feedback';

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 }); }
  const category = typeof body?.category === 'string' ? body.category : '';
  const text = typeof body?.body === 'string' ? body.body : '';
  if (!FEEDBACK_CATEGORIES.includes(category as any)) {
    return NextResponse.json({ ok: false, message: `Category must be one of: ${FEEDBACK_CATEGORIES.join(', ')}` }, { status: 400 });
  }
  const r = await submitFeedback({
    userId: user.id,
    category,
    body: text,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, feedbackId: r.feedbackId });
}
