// ==========================================================================
// VUNA Life — middleware
// Refreshes session cookies and exposes basic auth info to the request.
// We do NOT enforce auth here at the edge — that's done in the API routes
// (so RLS policies can use the user id). Middleware just makes sure the
// session cookie is fresh.
// ==========================================================================
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // In DEMO_MODE there's nothing to refresh — the cookie is signed with the
  // demo secret and lives for 7 days. We still pass through so the response
  // chain is intact.
  const res = NextResponse.next();

  // Optional: refresh cookie expiry on each request so it stays alive while
  // the user is active. Not strictly needed for Phase 1.
  const token = req.cookies.get('vuna_session')?.value;
  if (token) {
    res.cookies.set('vuna_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true',
      path: '/',
      maxAge: 7 * 86400,
    });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
