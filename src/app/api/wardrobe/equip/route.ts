// POST /api/wardrobe/equip — equip an owned item (server-side ownership check)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { equipItem } from '@/lib/economy/wardrobe';

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 }); }
  const itemId = typeof body?.itemId === 'string' ? body.itemId : null;
  if (!itemId) return NextResponse.json({ ok: false, message: 'itemId required.' }, { status: 400 });
  const r = await equipItem({ userId: user.id, itemId, ctx: { actorId: user.id, ...getRequestContext(req) } });
  const { ok: _ok, ...rest } = r;
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, ...rest });
}
