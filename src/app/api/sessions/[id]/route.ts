// GET /api/sessions/[id] — get a single session's state
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth/session';
import { getSession, getSessionQrState } from '@/lib/sessions/sessions';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const s = await getSession(id);
  if (!s) {
    return NextResponse.json({ ok: false, message: 'Session not found.' }, { status: 404 });
  }

  const qrState = await getSessionQrState(id);
  return NextResponse.json({ ok: true, session: s, qrState });
}
