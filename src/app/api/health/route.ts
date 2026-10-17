// GET /api/health — public health + mode check
import { NextResponse } from 'next/server';
import { IS_DEMO_MODE, IS_SUPABASE_CONFIGURED } from '@/lib/supabase';

export async function GET() {
  return NextResponse.json({
    ok: true,
    isDemoMode: IS_DEMO_MODE,
    supabaseConfigured: IS_SUPABASE_CONFIGURED,
    timestamp: new Date().toISOString(),
  });
}
