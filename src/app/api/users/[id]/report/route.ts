// POST /api/users/[id]/report — two-tap report (category chips only)
// Body: { category: 'harassment' | 'spam' | 'impersonation' | 'off_campus_contact' | 'other' }
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { submitReport, REPORT_CATEGORIES } from '@/lib/social/reports';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  const { id: targetId } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const category = typeof body?.category === 'string' ? body.category : '';
  if (!REPORT_CATEGORIES.includes(category as any)) {
    return NextResponse.json({
      ok: false,
      message: `Invalid category. Must be one of: ${REPORT_CATEGORIES.join(', ')}`,
    }, { status: 400 });
  }
  const r = await submitReport({
    reporterId: user.id,
    targetId,
    category,
    ctx: { actorId: user.id, ...getRequestContext(req as unknown as Request) },
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, reportId: r.reportId });
}
