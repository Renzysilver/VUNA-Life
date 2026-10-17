// POST /api/avatar/config — save body type + skin tone (server-side only)
// Body: { bodyType: 'slim'|'medium'|'full', skinTone: '#hex' }
// HARD RULE: avatar config is server-side only. The client sends
// the values; the server validates + writes to user.avatarConfig.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';

const VALID_BODY_TYPES = ['slim', 'medium', 'full'];
const VALID_SKIN_TONES = ['#FDDBB4', '#EAC086', '#D4956A', '#9C6035', '#6B3E20', '#3D1C0A'];

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 }); }

  const bodyType = typeof body?.bodyType === 'string' ? body.bodyType : null;
  const skinTone = typeof body?.skinTone === 'string' ? body.skinTone : null;

  if (!bodyType || !VALID_BODY_TYPES.includes(bodyType)) {
    return NextResponse.json({ ok: false, message: `bodyType must be one of: ${VALID_BODY_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!skinTone || !VALID_SKIN_TONES.includes(skinTone)) {
    return NextResponse.json({ ok: false, message: `skinTone must be one of: ${VALID_SKIN_TONES.join(', ')}` }, { status: 400 });
  }

  // Server-side write only — the client cannot write user.avatarConfig directly.
  await db.user.update({
    where: { id: user.id },
    data: { avatarConfig: JSON.stringify({ bodyType, skinTone }) },
  });

  return NextResponse.json({ ok: true, avatarConfig: { bodyType, skinTone } });
}
