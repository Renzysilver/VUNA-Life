// ==========================================================================
// VUNA Life — hair state machine
// Stages: Fresh → Neat → Growing → Overdue → Violation
// Hair grows on real days. The exact day counts are placeholders until the
// school rulebook is checked; config keys: hair_fresh_days, hair_neat_days,
// hair_growing_days, hair_overdue_days (each defaulting to 7, 7, 7, 7).
// ==========================================================================
import { db } from '@/lib/db';
import { getConfig } from './buildings';

export type HairStage = 'Fresh' | 'Neat' | 'Growing' | 'Overdue' | 'Violation';

export type HairView = {
  stage: HairStage;
  lastCutAt: Date;
  daysSinceCut: number;
  daysUntilNextStage: number;
  nextStage: HairStage | null;
};

const ORDER: HairStage[] = ['Fresh', 'Neat', 'Growing', 'Overdue', 'Violation'];
const DEFAULTS: Record<string, number> = {
  hair_fresh_days: 7,
  hair_neat_days: 7,
  hair_growing_days: 7,
  hair_overdue_days: 7,
};

/**
 * Compute the current hair stage from lastCutAt + config thresholds.
 * If the user has no row, treat as Fresh (just verified).
 */
export async function getHairState(userId: string): Promise<HairView> {
  const row = await db.hairState.findUnique({ where: { userId } });
  const lastCutAt = row?.lastCutAt ?? new Date();
  const daysSinceCut = Math.floor(
    (Date.now() - lastCutAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  const thresholds = [
    { days: await numConfig('hair_fresh_days', 7), stage: 'Fresh' as HairStage },
    { days: await numConfig('hair_neat_days', 7), stage: 'Neat' as HairStage },
    { days: await numConfig('hair_growing_days', 7), stage: 'Growing' as HairStage },
    { days: await numConfig('hair_overdue_days', 7), stage: 'Overdue' as HairStage },
  ];

  let stage: HairStage = 'Fresh';
  let cumulative = 0;
  for (const t of thresholds) {
    cumulative += t.days;
    if (daysSinceCut < cumulative) {
      stage = t.stage;
      break;
    }
    stage = t.stage;
  }
  // If we've passed Overdue threshold, it's a Violation.
  const overdueThreshold = thresholds.reduce((s, t) => s + t.days, 0);
  if (daysSinceCut >= overdueThreshold) stage = 'Violation';

  // Compute days until next stage.
  const idx = ORDER.indexOf(stage);
  let daysUntilNextStage = 0;
  let nextStage: HairStage | null = null;
  if (idx < ORDER.length - 1) {
    nextStage = ORDER[idx + 1];
    // Find the threshold for the current stage boundary.
    let boundary = 0;
    for (let i = 0; i <= idx; i++) boundary += thresholds[i].days;
    daysUntilNextStage = Math.max(0, boundary - daysSinceCut);
  }

  // If the DB row's stage is stale (different from the computed one), update it.
  if (row && row.stage !== stage) {
    await db.hairState.update({
      where: { userId },
      data: { stage, updatedAt: new Date() },
    });
  }

  return { stage, lastCutAt, daysSinceCut, daysUntilNextStage, nextStage };
}

async function numConfig(key: string, fallback: number): Promise<number> {
  const v = await getConfig(key);
  if (v == null) return fallback;
  if (typeof v === 'number') return v;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Server-side: get a haircut. Resets stage to Fresh, sets lastCutAt to now,
 * and posts a ledger entry for the haircut cost (random within the configured
 * range). Returns the new state and the cost charged.
 */
export async function getHaircut(
  userId: string,
  ctx: import('./audit-log').AuditContext,
): Promise<{ stage: HairStage; cost: number; balance: number }> {
  const min = await numConfig('haircut_cost_min', 150);
  const max = await numConfig('haircut_cost_max', 250);
  const cost = min + Math.floor(Math.random() * (max - min + 1));

  // Import here to avoid a circular dependency.
  const { postLedgerEntry } = await import('./wallet');
  const r = await postLedgerEntry({
    fromUser: userId,
    amount: cost,
    reason: 'haircut',
    metadata: { barber: 'campus_barber', previousStage: (await getHairState(userId)).stage },
    ctx,
  });

  await db.hairState.upsert({
    where: { userId },
    update: { stage: 'Fresh', lastCutAt: new Date(), updatedAt: new Date() },
    create: { userId, stage: 'Fresh', lastCutAt: new Date() },
  });

  return { stage: 'Fresh', cost, balance: r.balance };
}
