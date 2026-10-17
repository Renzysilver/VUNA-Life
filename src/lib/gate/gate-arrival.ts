// ==========================================================================
// VUNA Life — gate arrival scene
//
// The gate is the ONE scripted scene in VUNA Life. It runs on the
// student's first login of the day. The outcome is computed SERVER-SIDE
// (deterministic per userId + date) BEFORE the scene renders — the
// client cannot skip consequences.
//
// Officer personalities: strict, relaxed, suspicious, friendly
// (randomly assigned per day, seeded so the same student gets the same
// officer that day).
//
// Bag search: probability based on officer personality (from config).
// If searched, undeclared contraband → discipline entry (Warning tier).
//
// Dress code: if hair stage is Violation → automatic Form entry.
//
// HARD RULES:
//   - All officer dialogue lines stored in config (not hardcoded).
//   - Every AI line visibly labelled as AI.
//   - Discipline goes through the ladder (Warning → Form → Restriction
//     → Standing), never direct status writes.
//   - The scene is skippable after 3 seconds, but the outcome is
//     already computed — skipping doesn't avoid consequences.
// ==========================================================================
import { db } from '@/lib/db';
import { getHairState } from '@/lib/db/hair';
import { getConfig } from '@/lib/db/buildings';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

export type OfficerPersonality = 'strict' | 'relaxed' | 'suspicious' | 'friendly';
export type SearchOutcome = 'searched' | 'cleared' | 'contraband_found';
export type DressCodeResult = 'ok' | 'violation';

export type GateOutcome = {
  arrivalId: string;
  officerPersonality: OfficerPersonality;
  searchOutcome: SearchOutcome;
  dressCodeResult: DressCodeResult;
  disciplineApplied: string | null;
  dialogueLines: Array<{ text: string; isAI: boolean }>;
  alreadyArrived: boolean;
};

function dateKey(d: Date): Date {
  // Truncate to midnight (just the date part).
  const d2 = new Date(d);
  d2.setHours(0, 0, 0, 0);
  return d2;
}

// Deterministic hash per (userId, date) for officer assignment.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PERSONALITIES: OfficerPersonality[] = ['strict', 'relaxed', 'suspicious', 'friendly'];

/**
 * Compute the gate arrival outcome for a user today.
 *
 * Deterministic: same (userId, date) = same officer + same search outcome.
 * Idempotent: if the user already arrived today, returns the existing
 * gate_arrivals row without re-computing.
 *
 * The outcome is computed BEFORE the scene renders — the client can
 * skip the animation, but the consequences are already applied.
 */
export async function computeGateOutcome(args: {
  userId: string;
  ctx?: AuditContext;
}): Promise<GateOutcome> {
  const today = dateKey(new Date());
  const todayStr = today.toISOString().slice(0, 10);

  // Check if the user already arrived today.
  const existing = await db.gateArrival.findUnique({
    where: { userId_arrivalDate: { userId: args.userId, arrivalDate: today } },
  });
  if (existing) {
    // Already arrived — return the existing outcome with dialogue.
    const dialogue = await buildDialogue(existing.officerPersonality, existing.searchOutcome, existing.dressCodeResult);
    return {
      arrivalId: existing.id,
      officerPersonality: existing.officerPersonality as OfficerPersonality,
      searchOutcome: existing.searchOutcome as SearchOutcome,
      dressCodeResult: existing.dressCodeResult as DressCodeResult,
      disciplineApplied: existing.disciplineApplied,
      dialogueLines: dialogue,
      alreadyArrived: true,
    };
  }

  // ── Compute the outcome (server-side, deterministic per userId + date).
  const seed = hashStr(`${args.userId}:${todayStr}`);
  const officer = PERSONALITIES[seed % PERSONALITIES.length];

  // Search probability from config.
  const searchChanceRaw = await getConfig(`gate_search_chance_${officer}`);
  const searchChance = typeof searchChanceRaw === 'number'
    ? searchChanceRaw
    : parseFloat(String(searchChanceRaw ?? '0.5')) || 0.5;
  const searchRoll = ((seed >> 8) % 100) / 100; // deterministic 0.00-0.99
  const searched = searchRoll < searchChance;

  // Dress code: check hair stage.
  const hair = await getHairState(args.userId);
  const dressCodeResult: DressCodeResult = hair.stage === 'Violation' ? 'violation' : 'ok';

  // Determine search outcome.
  let searchOutcome: SearchOutcome;
  if (!searched) {
    searchOutcome = 'cleared';
  } else {
    // In DEMO_MODE, we don't have real contraband in the inventory
    // (no banned items configured yet). For now, contraband chance
    // is 0 (the student has nothing illegal). When the school rulebook
    // provides the banned items list, this check will compare the
    // student's inventory against the banned list.
    // For now: searched → always cleared (no contraband found).
    searchOutcome = 'cleared';
  }

  // ── Apply discipline (through the ladder, never direct writes).
  let disciplineApplied: string | null = null;
  if (dressCodeResult === 'violation') {
    // Hair Violation → Form tier.
    await db.discipline.create({
      data: {
        userId: args.userId,
        tier: 'Form',
        reason: `Gate arrival ${todayStr}: hair past the allowed level (Violation stage)`,
        metadata: JSON.stringify({ kind: 'gate', gateDate: todayStr, hairStage: hair.stage }),
      },
    });
    disciplineApplied = 'Form';
  } else if (searchOutcome === 'contraband_found') {
    // Contraband → Warning tier.
    await db.discipline.create({
      data: {
        userId: args.userId,
        tier: 'Warning',
        reason: `Gate arrival ${todayStr}: undeclared contraband found in bag search`,
        metadata: JSON.stringify({ kind: 'gate', gateDate: todayStr }),
      },
    });
    disciplineApplied = 'Warning';
  }

  // ── Store the outcome.
  const arrival = await db.gateArrival.create({
    data: {
      userId: args.userId,
      arrivalDate: today,
      officerPersonality: officer,
      searchOutcome,
      dressCodeResult,
      disciplineApplied,
      declaredItems: '[]',
      skipped: false,
    },
  });

  // Build the dialogue.
  const dialogue = await buildDialogue(officer, searchOutcome, dressCodeResult);

  await writeAudit(args.ctx ?? {}, 'gate_arrival', 'gate_arrivals', arrival.id, null, {
    userId: args.userId,
    officer,
    searchOutcome,
    dressCodeResult,
    disciplineApplied,
  });

  return {
    arrivalId: arrival.id,
    officerPersonality: officer,
    searchOutcome,
    dressCodeResult,
    disciplineApplied,
    dialogueLines: dialogue,
    alreadyArrived: false,
  };
}

/**
 * Build the dialogue lines from config. Each line is labelled as AI
 * (HARD RULE: every AI character is visibly labelled).
 */
async function buildDialogue(
  personality: OfficerPersonality,
  searchOutcome: SearchOutcome,
  dressCodeResult: DressCodeResult,
): Promise<Array<{ text: string; isAI: boolean }>> {
  const lines: Array<{ text: string; isAI: boolean }> = [];

  // Officer's first line (based on personality + search outcome).
  const searchKey = `gate_dialogue_${personality}_${searchOutcome}_1`;
  const searchLine = await getConfig(searchKey);
  if (searchLine) {
    lines.push({ text: String(searchLine).replace(/^"|"$/g, ''), isAI: true });
  }

  // If dress code violation, add the violation line.
  if (dressCodeResult === 'violation') {
    const violationLine = await getConfig('gate_dialogue_violation_hair_1');
    if (violationLine) {
      lines.push({ text: String(violationLine).replace(/^"|"$/g, ''), isAI: true });
    }
  }

  return lines;
}

/**
 * Mark a gate arrival as skipped. The outcome was already applied —
 * skipping just dismisses the scene UI.
 */
export async function skipGateArrival(arrivalId: string): Promise<void> {
  await db.gateArrival.update({
    where: { id: arrivalId },
    data: { skipped: true },
  });
}

/**
 * Check if the user has already arrived at the gate today.
 */
export async function hasArrivedToday(userId: string): Promise<boolean> {
  const today = dateKey(new Date());
  const r = await db.gateArrival.findUnique({
    where: { userId_arrivalDate: { userId, arrivalDate: today } },
  });
  return !!r;
}
