// GET /api/hustle/status — is the window open? how many attempts left?
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth/session';
import { getHustleStatus, getConsignmentItems } from '@/lib/economy/hustle';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const status = await getHustleStatus(session.sub);
  return NextResponse.json({ ok: true, status, items: getConsignmentItems() });
}
