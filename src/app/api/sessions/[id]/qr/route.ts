// GET /api/sessions/[id]/qr — current rotating QR token (lecturer view)
// Returns the token string + an SVG QR image (rendered server-side via
// the `qrcode` package) + secondsUntilRotation so the client can poll.
import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { getSessionQrState } from '@/lib/sessions/sessions';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || (user.role !== 'lecturer' && user.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Lecturer access required.' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const state = await getSessionQrState(id);
  if (!state) {
    return NextResponse.json({ ok: false, message: 'Session not found.' }, { status: 404 });
  }

  if (!state.isOpen) {
    return NextResponse.json({
      ok: true,
      isOpen: false,
      opensAt: state.opensAt,
      closesAt: state.closesAt,
      secondsUntilOpen: state.secondsUntilOpen,
      secondsUntilClose: state.secondsUntilClose,
      token: null,
      qrSvg: null,
      slotIndex: null,
      secondsUntilRotation: null,
    });
  }

  // Render the QR code as an SVG string.
  let qrSvg: string | null = null;
  try {
    qrSvg = await QRCode.toString(state.token, {
      type: 'svg',
      margin: 1,
      width: 320,
      color: {
        dark: '#0d1b2a', // Night Sky foreground
        light: '#ffffff00', // transparent
      },
    });
  } catch (e) {
    // If QR rendering fails, the token text is still returned.
  }

  return NextResponse.json({
    ok: true,
    isOpen: true,
    opensAt: state.opensAt,
    closesAt: state.closesAt,
    secondsUntilOpen: state.secondsUntilOpen,
    secondsUntilClose: state.secondsUntilClose,
    token: state.token,
    qrSvg,
    slotIndex: state.slotIndex,
    secondsUntilRotation: state.secondsUntilRotation,
  });
}
