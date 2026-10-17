// ==========================================================================
// VUNA Life — building activities
// Replaces the "Activities unlock in Phase 5" placeholder with real actions.
//
// Activity types (per the user's Phase 5 prompt):
//   - study   (Library)             → +25 CC Scholar-path XP
//   - eat     (Multipurpose Hall /  → +15 CC Social-path XP
//              Canteen)
//   - checkin (Chapel, Lecture      → +50 CC Faith-path XP (mass only)
//              halls, etc.)
//
// Each activity posts a CC reward via the append-only ledger (server-side
// only, subject to the daily earning cap + anomaly detection) and updates
// the user's presence at that building.
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { setPresence } from '@/lib/presence/presence';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';
import { getConfig } from '@/lib/db/buildings';

export type ActivityType = 'study' | 'eat' | 'checkin';

export type ActivityDef = {
  type: ActivityType;
  label: string;
  description: string;
  rewardCC: number;
  xpPath: 'Scholar' | 'Social' | 'Faith' | 'Athlete' | 'Creative' | 'Leader';
  xpAmount: number;
};

/**
 * Resolve the activities available at a building, based on its category
 * and (in some cases) its pin. Per the user's Phase 5 prompt:
 *   - Library (pin '8')                  → study
 *   - Multipurpose Hall / Canteen (pin '6') → eat
 *   - Chapel (pin 'chapel')              → checkin (faith)
 *   - Lecture halls (any academic)       → checkin (study, no XP)
 *
 * Buildings with no activities configured return an empty list.
 */
export function activitiesForBuilding(b: { pin: string; category: string; name: string | null }): ActivityDef[] {
  const out: ActivityDef[] = [];

  // Library → study
  if (b.pin === '8' || b.name?.toLowerCase().includes('library')) {
    out.push({
      type: 'study',
      label: 'Study for 30 minutes',
      description: 'Find a table and crack open your books. +25 CC, +10 Scholar XP.',
      rewardCC: 25,
      xpPath: 'Scholar',
      xpAmount: 10,
    });
  }

  // Multipurpose Hall / canteen → eat
  if (b.pin === '6' || b.name?.toLowerCase().includes('canteen') || b.name?.toLowerCase().includes('hall')) {
    out.push({
      type: 'eat',
      label: 'Eat at the canteen',
      description: 'Rice and stew, fried rice, or bread and egg. +15 CC back as meal allowance, +10 Social XP.',
      rewardCC: 15,
      xpPath: 'Social',
      xpAmount: 10,
    });
  }

  // Chapel → checkin (faith)
  if (b.pin === 'chapel' || b.name?.toLowerCase().includes('chapel') || b.name?.toLowerCase().includes('chaplaincy')) {
    out.push({
      type: 'checkin',
      label: 'Check in at mass',
      description: 'Compulsory faculty mass at 12:10. +50 CC, +10 Faith XP. (Use the Lecturer screen for actual QR check-in.)',
      rewardCC: 50,
      xpPath: 'Faith',
      xpAmount: 10,
    });
  }

  // Any academic building → checkin (study, no XP, just presence)
  if (b.category === 'academic' && out.length === 0) {
    out.push({
      type: 'checkin',
      label: 'Mark yourself as studying here',
      description: 'No reward, just marks your presence at this building. Friends can find you here.',
      rewardCC: 0,
      xpPath: 'Scholar',
      xpAmount: 0,
    });
  }

  // Sports fields/courts → athlete
  if (b.category === 'sports') {
    out.push({
      type: 'checkin',
      label: 'Train for 30 minutes',
      description: 'Football, basketball, or volleyball. +20 CC, +10 Athlete XP.',
      rewardCC: 20,
      xpPath: 'Athlete',
      xpAmount: 10,
    });
  }

  return out;
}

export type DoActivityResult =
  | { ok: true; rewardCC: number; xpPath: string; xpAmount: number; newBalance: number; newTotalXp: number }
  | { ok: false; reason: 'building_not_found' | 'activity_not_available' | 'account_frozen' | 'unknown'; message: string };

/**
 * Perform an activity at a building. Posts the CC reward via the ledger
 * (server-side only, subject to cap + anomaly detection), bumps the
 * relevant stat, and updates the user's presence at that building.
 *
 * The reward is an EARNING entry (reason='campus_job') — subject to the
 * daily earning cap. If the user is at cap, the reward is clipped to 0
 * (still updates presence + XP, just no more CC).
 */
export async function doActivity(args: {
  userId: string;
  buildingId: string;
  activityType: ActivityType;
  ctx?: AuditContext;
}): Promise<DoActivityResult> {
  const b = await db.building.findUnique({ where: { id: args.buildingId } });
  if (!b) return { ok: false, reason: 'building_not_found', message: 'Building not found.' };

  const activities = activitiesForBuilding({
    pin: b.pin,
    category: b.category,
    name: b.name,
  });
  const activity = activities.find((a) => a.type === args.activityType);
  if (!activity) {
    return { ok: false, reason: 'activity_not_available', message: 'That activity is not available at this building.' };
  }

  // Post the CC reward (subject to cap + anomaly detection).
  let newBalance = 0;
  let capped = false;
  if (activity.rewardCC > 0) {
    try {
      const r = await postLedgerEntry({
        toUser: args.userId,
        amount: activity.rewardCC,
        reason: 'campus_job',
        metadata: { buildingId: args.buildingId, activity: activity.type, pin: b.pin },
        ctx: args.ctx,
      });
      newBalance = r.balance;
      capped = r.capped;
    } catch (e: any) {
      if (e.code === 'account_frozen') {
        return { ok: false, reason: 'account_frozen', message: 'Your account is frozen.' };
      }
      return { ok: false, reason: 'unknown', message: e.message ?? 'Activity failed.' };
    }
  } else {
    // No reward — just read the balance for the response.
    const { getWallet } = await import('@/lib/db/wallet');
    const w = await getWallet(args.userId);
    newBalance = w.balance;
  }

  // Bump the stat for the activity's path.
  let newTotalXp = 0;
  if (activity.xpAmount > 0) {
    const stat = await db.stat.upsert({
      where: { userId_path: { userId: args.userId, path: activity.xpPath } },
      update: { xp: { increment: activity.xpAmount }, updatedAt: new Date() },
      create: { userId: args.userId, path: activity.xpPath, xp: activity.xpAmount },
    });
    newTotalXp = stat.xp;
  }

  // Update presence at the building.
  await setPresence({
    userId: args.userId,
    buildingId: args.buildingId,
    state: 'solid',
  });

  await writeAudit(args.ctx ?? {}, 'do_activity', 'presence', args.buildingId, null, {
    userId: args.userId,
    activity: activity.type,
    buildingId: args.buildingId,
    rewardCC: activity.rewardCC,
    capped,
    xpPath: activity.xpPath,
    xpAmount: activity.xpAmount,
    newBalance,
    newTotalXp,
  });

  return {
    ok: true,
    rewardCC: activity.rewardCC,
    xpPath: activity.xpPath,
    xpAmount: activity.xpAmount,
    newBalance,
    newTotalXp,
  };
}
