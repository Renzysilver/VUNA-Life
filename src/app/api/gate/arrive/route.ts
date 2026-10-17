// POST /api/gate/arrive — compute (or return) today's gate arrival outcome
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { computeGateOutcome, skipGateArrival } from '@/lib/gate/gate-arrival';

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body?.action ?? 'compute';

  if (action === 'skip') {
    const arrivalId = body?.arrivalId;
    if (!arrivalId) return NextResponse.json({ ok: false, message: 'arrivalId required.' }, { status: 400 });
    await skipGateArrival(arrivalId);
    return NextResponse.json({ ok: true });
  }

  // Default: compute (or return) today's outcome.
  const outcome = await computeGateOutcome({
    userId: user.id,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  return NextResponse.json({ ok: true, ...outcome });
}
