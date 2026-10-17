// POST /api/presence — set the user's presence at a building (15-min TTL)
// GET  /api/presence — list presence counts per building (privacy-safe)
// GET  /api/presence?buildingId=X — list who is at building X (privacy-filtered)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { setPresence, listPresenceCountsPerBuilding, listPresenceAtBuilding, getMyPresence } from '@/lib/presence/presence';

export async function GET(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const buildingId = url.searchParams.get('buildingId');
  if (buildingId) {
    // List who is at a specific building — privacy-filtered.
    const rows = await listPresenceAtBuilding({ buildingId, viewerId: session.sub });
    return NextResponse.json({ ok: true, presence: rows });
  }
  // Default: list counts per building.
  const counts = await listPresenceCountsPerBuilding();
  const myPresence = await getMyPresence(session.sub);
  return NextResponse.json({ ok: true, counts, myPresence });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const buildingId = typeof body?.buildingId === 'string' ? body.buildingId : null;
  if (!buildingId) {
    return NextResponse.json({ ok: false, message: 'buildingId is required.' }, { status: 400 });
  }
  // Verify the building exists.
  const b = await db.building.findUnique({ where: { id: buildingId } });
  if (!b) {
    return NextResponse.json({ ok: false, message: 'Building not found.' }, { status: 404 });
  }
  await setPresence({
    userId: session.sub,
    buildingId,
    state: body?.state ?? 'solid',
  });
  return NextResponse.json({ ok: true });
}
