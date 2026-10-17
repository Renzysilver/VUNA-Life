// GET /api/admin/feedback — list all feedback (admin only)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { listFeedback } from '@/lib/social/feedback';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'admin') return NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 });
  const rows = await listFeedback(100);
  return NextResponse.json({ ok: true, feedback: rows });
}
