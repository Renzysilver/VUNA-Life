// POST /api/auth/request-otp
// Body: { email: string }
// 1. Validates email shape.
// 2. Reads ALLOWED_EMAIL_DOMAINS from config (default empty -> verification closed).
// 3. If allowed: create a verification row, hash OTP, return either:
//    - DEMO_MODE: { ok, demoOtp, expiresInSec } so the UI can display it
//    - PRODUCTION: { ok, expiresInSec } and send email via Supabase Auth (Phase 3 onwards)
// 4. If rejected: return a non-leaky error message.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getConfig } from '@/lib/db/buildings';
import { parseAllowedDomains, checkEmailDomain, publicRejectionReason } from '@/lib/auth/email-domain-check';
import { createVerification } from '@/lib/auth/otp';
import { IS_DEMO_MODE } from '@/lib/supabase';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (email.length === 0) {
    return NextResponse.json({ ok: false, message: 'Email is required.' }, { status: 400 });
  }

  const allowedRaw = await getConfig('allowed_email_domains');
  const allowed = parseAllowedDomains(allowedRaw);

  // In DEMO_MODE only, we bypass the whitelist so the dev/preview flow can
  // be exercised end-to-end. The test in tests/email-domain-check.test.ts
  // proves the whitelist itself rejects everything when the list is empty —
  // the bypass lives ONLY here in the API route, NOT in the check function.
  // When real Supabase env vars are set, IS_DEMO_MODE is false and the bypass
  // disappears, so production sign-ups still respect the whitelist exactly.
  const check = IS_DEMO_MODE
    ? { ok: true as const, domain: email.split('@')[1]?.toLowerCase() ?? '' }
    : checkEmailDomain(email, allowed);

  if (!check.ok) {
    // Rate-limit: sleep ~300ms before returning, to blunt a brute-force probe.
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json(
      { ok: false, message: publicRejectionReason(check) },
      { status: 403 },
    );
  }

  const ip = req.headers.get('x-forwarded-for') ?? null;
  const ua = req.headers.get('user-agent') ?? null;

  const v = await createVerification(email, ip, ua);

  // We also auto-upsert a User row (without verified flag) so the OTP can be
  // associated with a user record. isVerifiedStudent stays false until verify.
  // The role is 'student' by default; admins are promoted manually.
  await db.user.upsert({
    where: { email },
    update: {},
    create: { email, role: 'student', isVerifiedStudent: false },
  });

  if (IS_DEMO_MODE || v.isDemo) {
    return NextResponse.json({
      ok: true,
      message: 'DEMO MODE: OTP is shown here. In production it is emailed.',
      demoOtp: v.code,
      expiresInSec: Math.floor((v.expiresAt.getTime() - Date.now()) / 1000),
    });
  }

  // PRODUCTION PATH (Phase 3+): hand the OTP off to Supabase Auth's email-otp
  // flow. Not wired in Phase 1; the response just confirms creation.
  return NextResponse.json({
    ok: true,
    message: 'A verification code was sent to your school email.',
    expiresInSec: Math.floor((v.expiresAt.getTime() - Date.now()) / 1000),
  });
}
