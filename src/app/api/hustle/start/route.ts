// POST /api/hustle/start — start a hustle attempt
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { startHustle } from '@/lib/economy/hustle';

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 }); }
  const itemCode = typeof body?.itemCode === 'string' ? body.itemCode : null;
  const salePrice = typeof body?.salePrice === 'number' ? body.salePrice : NaN;
  if (!itemCode || isNaN(salePrice)) {
    return NextResponse.json({ ok: false, message: 'itemCode and salePrice required.' }, { status: 400 });
  }
  const r = await startHustle({
    userId: user.id,
    itemCode,
    salePrice,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  const { ok: _ok, ...rest } = r;
  return NextResponse.json({ ok: true, ...rest });
}
