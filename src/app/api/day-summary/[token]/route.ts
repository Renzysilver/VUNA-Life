// GET /api/day-summary/[token] — public share view (no auth required)
// Returns the day summary payload (no PII beyond username + displayName).
import { NextResponse, type NextRequest } from 'next/server';
import { getDaySummaryByToken } from '@/lib/economy/day-summary';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ ok: false, message: 'token is required.' }, { status: 400 });
  }
  const r = await getDaySummaryByToken(token);
  if (!r) {
    return NextResponse.json({ ok: false, message: 'Day summary not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, payload: r.payload });
}
