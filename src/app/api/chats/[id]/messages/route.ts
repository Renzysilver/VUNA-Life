// GET  /api/chats/[id]/messages — list messages in a chat
// POST /api/chats/[id]/messages — send a message (body: { body })
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { sendMessage, listMessages } from '@/lib/social/chats';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const { id } = await ctx.params;
  const r = await listMessages(id, session.sub);
  if (!r.ok) return NextResponse.json({ ok: false, message: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, messages: r.messages });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const text = typeof body?.body === 'string' ? body.body : '';
  if (!text.trim()) {
    return NextResponse.json({ ok: false, message: 'Empty message.' }, { status: 400 });
  }
  const r = await sendMessage({
    chatId: id,
    senderId: user.id,
    body: text,
    ctx: { actorId: user.id, ...getRequestContext(req as unknown as Request) },
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, messageId: r.messageId });
}
