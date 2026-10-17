// GET /api/wardrobe/items — list all wardrobe items + user's owned/equipped state
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth/session';
import { listWardrobeItems, getUserWardrobeState } from '@/lib/economy/wardrobe';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const items = await listWardrobeItems();
  const state = await getUserWardrobeState(session.sub);
  return NextResponse.json({ ok: true, items, ...state });
}
