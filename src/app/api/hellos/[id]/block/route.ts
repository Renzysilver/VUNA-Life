// POST /api/hellos/[id]/block — block the sender of a hello
// Per HARD RULE: block is INSTANT and SILENT. The blocked user is NOT notified.
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { blockHello } from '@/lib/social/hellos';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  const { id } = await ctx.params;
  const r = await blockHello({
    helloId: id,
    blockerId: user.id,
    ctx: { actorId: user.id, ...getRequestContext(req as unknown as Request) },
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message, reason: r.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
