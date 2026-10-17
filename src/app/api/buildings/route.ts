// GET /api/buildings — list all buildings (any authenticated user)
import { NextResponse } from 'next/server';
import { listBuildings } from '@/lib/db/buildings';
import { getSessionFromCookie } from '@/lib/auth/session';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const buildings = await listBuildings();
  return NextResponse.json({ ok: true, buildings });
}
