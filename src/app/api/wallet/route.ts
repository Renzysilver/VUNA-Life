// GET  /api/wallet — wallet view (balance, cap progress, recent ledger, frozen state)
// POST /api/wallet/unfreeze — admin-only unfreeze (when an admin reviews a frozen account)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { getWallet, listLedger, unfreezeAccount } from '@/lib/db/wallet';

export async function GET(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const wallet = await getWallet(session.sub);
  const ledger = await listLedger(session.sub, 30);
  return NextResponse.json({
    ok: true,
    wallet,
    ledger: ledger.map((r) => ({
      id: r.id,
      fromUser: r.fromUser,
      toUser: r.toUser,
      amount: r.amount,
      reason: r.reason,
      metadata: safeJson(r.metadata),
      createdAt: r.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  // Admin unfreeze action
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const targetUserId = typeof body?.userId === 'string' ? body.userId : null;
  if (!targetUserId) {
    return NextResponse.json({ ok: false, message: 'userId is required.' }, { status: 400 });
  }

  await unfreezeAccount({
    userId: targetUserId,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  return NextResponse.json({ ok: true });
}

function safeJson(s: string | null): any {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
