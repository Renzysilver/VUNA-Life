// GET /api/chats — list the user's chats
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth/session';
import { listMyChats } from '@/lib/social/chats';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const chats = await listMyChats(session.sub);
  return NextResponse.json({ ok: true, chats });
}
