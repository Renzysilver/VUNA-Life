// GET  /api/hellos — list incoming + outgoing hellos
// POST /api/hellos — send a hello (body: { toUserId, buildingId?, message? })
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { sendHello, listMyHellos } from '@/lib/social/hellos';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const { incoming, outgoing } = await listMyHellos(session.sub);
  return NextResponse.json({ ok: true, incoming, outgoing });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const toUserId = typeof body?.toUserId === 'string' ? body.toUserId : null;
  if (!toUserId) {
    return NextResponse.json({ ok: false, message: 'toUserId is required.' }, { status: 400 });
  }
  const r = await sendHello({
    fromUserId: user.id,
    toUserId,
    buildingId: typeof body?.buildingId === 'string' ? body.buildingId : undefined,
    message: typeof body?.message === 'string' ? body.message.slice(0, 200) : undefined,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, helloId: r.helloId });
}
