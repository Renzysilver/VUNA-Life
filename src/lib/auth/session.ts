// Helper to read session claims from the request cookie on the server side.
import { cookies } from 'next/headers';
import { verifySession, type SessionClaims } from '@/lib/auth/otp';

export async function getSessionFromCookie(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get('vuna_session')?.value;
  return verifySession(token);
}

export function getRequestContext(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = req.headers.get('user-agent') ?? null;
  return { ip, userAgent: ua };
}
