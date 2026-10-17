// ==========================================================================
// VUNA Life — seed script: ingest veritas_campus_map.json into local DB
// Idempotent: deletes existing rows for the seeded tables first.
// Run with: bun run scripts/seed-campus.ts
// ==========================================================================
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const prisma = new PrismaClient();

type RawBuilding = {
  id: string;
  name?: string | null;
  category?: string;
  gender_attr?: string | null;
  status?: string;
  footprints?: Array<{
    centre_px?: [number, number];
    size_px?: [number, number];
    angle_deg?: number;
    polygon_px?: Array<[number, number]>;
    polygon_m?: Array<[number, number]>;
  }>;
  courtyard_px?: Array<[number, number, number, number, number]> | null;
  position_status?: string;
  facing?: string | null;
  entrance?: any;
};

type RawMap = {
  campus: string;
  version: string;
  scale: { m_per_px: number };
  north: string;
  georeference: any;
  main_gate_inferred: { px: [number, number]; status: string } | null;
  roads: Array<{
    id: string;
    kind: string;
    width_px: number;
    polyline_px: Array<[number, number]>;
    polyline_m: Array<[number, number]>;
  }>;
  tracks: Array<{ polyline_px: Array<[number, number]> }>;
  fields: Array<{
    id: string;
    name?: string;
    polygon_px: Array<[number, number]>;
    polygon_m: Array<[number, number]>;
  }>;
  courts: Array<{ rects: Array<[number, number, number, number, number]> }>;
  buildings: RawBuilding[];
};

const CAMPUS_JSON = resolve(process.cwd(), 'veritas_campus_map.json');

// Map JSON category values to building_category enum values (sqlite stores as text).
function mapCategory(c: string | undefined | null): string {
  if (!c) return 'other';
  const v = c.toLowerCase();
  if (['academic','hostel','shop','service','sports','other'].includes(v)) return v;
  return 'other';
}

// Map JSON status values to building_status enum values.
// The JSON uses: USER_CONFIRMED, SECONDARY_SOURCE, UNNAMED, NAME_PENDING, PROPOSED, plus inferred text.
function mapStatus(s: string | undefined | null): string {
  if (!s) return 'TO_VERIFY';
  const v = s.toUpperCase();
  const allowed = ['USER_CONFIRMED','SECONDARY_SOURCE','UNNAMED','NAME_PENDING','PROPOSED','MISSING_FROM_OLD_IMAGE','TO_VERIFY'];
  if (allowed.includes(v)) return v;
  return 'TO_VERIFY';
}

async function main() {
  const raw: RawMap = JSON.parse(readFileSync(CAMPUS_JSON, 'utf-8'));
  console.log(`[seed] campus=${raw.campus} version=${raw.version}`);
  console.log(`[seed] buildings=${raw.buildings.length} roads=${raw.roads.length} tracks=${raw.tracks.length} fields=${raw.fields.length} courts=${raw.courts.length}`);

  // Order matters: buildings first (foreign keys from timetable, sessions, etc.),
  // then map tables, then config defaults, then audit_log empty (will be filled by mutations).
  await prisma.$transaction([
    prisma.mapCourt.deleteMany({}),
    prisma.mapField.deleteMany({}),
    prisma.mapTrack.deleteMany({}),
    prisma.mapRoad.deleteMany({}),
    prisma.building.deleteMany({}),
  ]);

  // ---------- buildings ----------
  let bInserts = 0;
  for (const b of raw.buildings) {
    const pin = String(b.id);
    const status = mapStatus(b.status);
    const name = b.name ?? null;
    const genderAttr = (b.gender_attr === 'boys' || b.gender_attr === 'girls' || b.gender_attr === 'mixed' || b.gender_attr === 'staff')
      ? b.gender_attr
      : null;
    const footprints = JSON.stringify(b.footprints ?? []);
    const courtyardPx = b.courtyard_px ? JSON.stringify(b.courtyard_px) : null;
    await prisma.building.create({
      data: {
        pin,
        name,
        category: mapCategory(b.category),
        genderAttr,
        status,
        positionStatus: b.position_status ?? 'APPROX_TRACED_FROM_OLD_SATELLITE_IMAGE',
        facing: b.facing ?? null,
        footprints,
        courtyardPx,
        sourceNote: `Imported from ${raw.version}`,
      },
    });
    bInserts++;
  }
  console.log(`[seed] buildings inserted: ${bInserts}`);

  // ---------- roads ----------
  let rInserts = 0;
  for (const r of raw.roads) {
    await prisma.mapRoad.create({
      data: {
        roadId: r.id,
        kind: r.kind,
        widthPx: r.width_px,
        polylinePx: JSON.stringify(r.polyline_px),
        polylineM: JSON.stringify(r.polyline_m),
      },
    });
    rInserts++;
  }
  console.log(`[seed] roads inserted: ${rInserts}`);

  // ---------- tracks ----------
  let tInserts = 0;
  for (const t of raw.tracks) {
    await prisma.mapTrack.create({
      data: {
        polylinePx: JSON.stringify(t.polyline_px),
      },
    });
    tInserts++;
  }
  console.log(`[seed] tracks inserted: ${tInserts}`);

  // ---------- fields ----------
  let fInserts = 0;
  for (const f of raw.fields) {
    await prisma.mapField.create({
      data: {
        fieldId: f.id,
        name: f.name ?? null,
        polygonPx: JSON.stringify(f.polygon_px),
        polygonM: JSON.stringify(f.polygon_m),
      },
    });
    fInserts++;
  }
  console.log(`[seed] fields inserted: ${fInserts}`);

  // ---------- courts ----------
  let cInserts = 0;
  for (const c of raw.courts) {
    await prisma.mapCourt.create({
      data: {
        rects: JSON.stringify(c.rects),
      },
    });
    cInserts++;
  }
  console.log(`[seed] courts inserted: ${cInserts}`);

  // ---------- config defaults ----------
  const configRows: Array<[string, string, string]> = [
    ['cc_to_naira_ratio', '10', 'Approx 1 CC = 10 naira. Used for flavour only, never for real money.'],
    ['weekly_allowance_min', '1200', 'Min weekly allowance in CC.'],
    ['weekly_allowance_max', '2000', 'Max weekly allowance in CC.'],
    ['daily_earning_cap', '300', 'Starting daily earning cap in CC.'],
    ['meal_cost_min', '100', 'Min meal cost in CC.'],
    ['meal_cost_max', '160', 'Max meal cost in CC.'],
    ['haircut_cost_min', '150', 'Min haircut cost in CC.'],
    ['haircut_cost_max', '250', 'Max haircut cost in CC.'],
    ['missed_mass_fine', '500', 'CC fine for missing compulsory faculty mass.'],
    ['hostel_lock_time', '"22:00"', 'Hostel lock time, 24h local.'],
    ['mass_start_time', '"12:10"', 'Faculty mass start time.'],
    ['mass_end_time', '"13:00"', 'Faculty mass end time.'],
    ['qr_rotation_seconds', '10', 'How often the QR token rotates.'],
    ['allowed_email_domains', '[]', 'JSON array of allowed school email domains. EMPTY = verification closed. Populated by admin.'],
    ['hello_cooldown_minutes', '15', 'Cooldown after an ignored hello.'],
    ['max_hellos_per_day', '20', 'Hard cap on hellos sent per day.'],
    ['chat_rate_limit_per_min', '12', 'Max chat messages per minute.'],
  ];
  for (const [key, value, desc] of configRows) {
    await prisma.config.upsert({
      where: { key },
      update: {},
      create: { key, value, description: desc },
    });
  }
  console.log(`[seed] config rows upserted: ${configRows.length}`);

  // ---------- DEMO MODE sample data (clearly labelled, only for local dev) ----------
  // These rows let the UI show a realistic-looking student dashboard without
  // any real users in the database. They are NEVER created in production.
  if (process.env.DEMO_SEED_SAMPLE_DATA === '1') {
    console.log('[seed] seeding DEMO sample data...');

    // Demo department
    const dept = await prisma.department.upsert({
      where: { code: 'CSC' },
      update: {},
      create: { code: 'CSC', name: 'Computer Science (demo)', faculty: 'Natural and Applied Sciences' },
    });

    // Demo student
    const studentEmail = 'student.demo@vuna-life.local';
    const student = await prisma.user.upsert({
      where: { email: studentEmail },
      update: {},
      create: {
        email: studentEmail,
        username: 'demo_student',
        displayName: 'Demo Student',
        role: 'student',
        departmentId: dept.id,
        level: 200,
        isVerifiedStudent: true,
      },
    });

    // Demo admin
    const adminEmail = 'admin.demo@vuna-life.local';
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        username: 'demo_admin',
        displayName: 'Demo Admin',
        role: 'admin',
        isVerifiedStudent: true,
      },
    });

    // Demo course + Monday timetable entries
    const course = await prisma.course.upsert({
      where: { code_departmentId_level: { code: 'CSC201', departmentId: dept.id, level: 200 } },
      update: {},
      create: { code: 'CSC201', title: 'Data Structures (demo)', departmentId: dept.id, level: 200, credits: 3 },
    });

    const monday = 1; // 0=Sun, 1=Mon
    const blocksBuilding = await prisma.building.findUnique({ where: { pin: '2' } }); // Block A
    if (blocksBuilding) {
      await prisma.timetable.create({
        data: {
          courseId: course.id,
          departmentId: dept.id,
          level: 200,
          weekday: monday,
          startTime: '08:00',
          endTime: '10:00',
          venueId: blocksBuilding.id,
        },
      });
      await prisma.timetable.create({
        data: {
          courseId: course.id,
          departmentId: dept.id,
          level: 200,
          weekday: monday,
          startTime: '14:00',
          endTime: '16:00',
          venueId: blocksBuilding.id,
        },
      });
    }

    console.log(`[seed] demo user ${student.email} + Monday timetable seeded`);
  } else {
    console.log('[seed] skipping DEMO sample data (set DEMO_SEED_SAMPLE_DATA=1 to enable)');
  }

  console.log('[seed] done');
}

main()
  .catch((e) => {
    console.error('[seed] FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
