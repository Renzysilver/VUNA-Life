// ==========================================================================
// VUNA Life — Supabase client wrappers
// In production (env vars set), these wrap @supabase/supabase-js. In DEMO_MODE
// (env vars missing), they return null and the app falls back to the Prisma/
// SQLite local adapter at src/lib/db/index.ts.
// ==========================================================================
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const IS_SUPABASE_CONFIGURED =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0 && SUPABASE_SERVICE_ROLE_KEY.length > 0;

export const IS_DEMO_MODE = !IS_SUPABASE_CONFIGURED || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/**
 * Server-side Supabase client using the service role key. Bypasses RLS.
 * Use ONLY in trusted server code (API routes, server components, server actions).
 * Throws if env vars are missing (DEMO_MODE doesn't use this).
 */
export function serverSupabase(): SupabaseClient {
  if (!IS_SUPABASE_CONFIGURED) {
    throw new Error(
      'Supabase env vars are not set. The app is in DEMO_MODE — use src/lib/db instead.',
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Browser-side Supabase client using the anon key. Respects RLS.
 * Returns null in DEMO_MODE — the browser uses /api routes for everything.
 */
export function browserSupabase(): SupabaseClient | null {
  if (!IS_SUPABASE_CONFIGURED) return null;
  if (typeof window === 'undefined') return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
// cache-bust 1792203233
