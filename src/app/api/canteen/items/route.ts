// GET /api/canteen/items — list canteen items (any authenticated user)
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth/session';
import { listCanteenItems } from '@/lib/economy/canteen';
import { getWallet } from '@/lib/db/wallet';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const items = await listCanteenItems();
  const wallet = await getWallet(session.sub);
  return NextResponse.json({ ok: true, items, wallet: { balance: wallet.balance, frozen: wallet.frozen } });
}
