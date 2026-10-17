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
    ['naira_currency_symbol', '"₦"', 'Currency symbol for display.'],
    ['cc_to_naira_ratio', '10', 'Historical ratio — kept for migration reference. No longer used for pricing.'],
    ['weekly_allowance_min', '12000', 'Min weekly allowance in Naira.'],
    ['weekly_allowance_max', '20000', 'Max weekly allowance in Naira.'],
    ['daily_earning_cap', '3000', 'Starting daily earning cap in Naira.'],
    ['meal_cost_min', '300', 'Min meal cost in Naira.'],
    ['meal_cost_max', '800', 'Max meal cost in Naira.'],
    ['haircut_cost_min', '1500', 'Min haircut cost in Naira.'],
    ['haircut_cost_max', '2500', 'Max haircut cost in Naira.'],
    ['missed_mass_fine', '2500', 'Naira fine for missing compulsory faculty mass.'],
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
        isBeta: true,
        avatarPath: 'scholar',
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
    const libraryBuilding = await prisma.building.findUnique({ where: { pin: '8' } });
    const canteenBuilding = await prisma.building.findUnique({ where: { pin: '6' } }); // Multipurpose Hall (AC Canteen near it)

    if (blocksBuilding) {
      // Clean previous demo timetable entries first so re-seeding is idempotent
      await prisma.timetable.deleteMany({ where: { departmentId: dept.id, level: 200 } });

      await prisma.timetable.create({
        data: {
          courseId: course.id, departmentId: dept.id, level: 200,
          weekday: monday, startTime: '08:00', endTime: '10:00',
          venueId: blocksBuilding.id,
        },
      });
      await prisma.timetable.create({
        data: {
          courseId: course.id, departmentId: dept.id, level: 200,
          weekday: monday, startTime: '14:00', endTime: '16:00',
          venueId: blocksBuilding.id,
        },
      });
      // Wednesday and Friday classes too, so the timetable week grid has more shape
      const wed = 3, fri = 5;
      await prisma.timetable.create({
        data: {
          courseId: course.id, departmentId: dept.id, level: 200,
          weekday: wed, startTime: '10:00', endTime: '12:00',
          venueId: libraryBuilding?.id ?? blocksBuilding.id,
        },
      });
      await prisma.timetable.create({
        data: {
          courseId: course.id, departmentId: dept.id, level: 200,
          weekday: fri, startTime: '08:00', endTime: '09:00',
          venueId: blocksBuilding.id,
        },
      });
    }

    // ---------- Daily goal templates ----------
    // The goals engine picks 3 of these per student per day. Each goal is
    // tagged with a life_path (Scholar, Social, Faith, Athlete, Creative, Leader).
    // All templates here are daily cadence. Real school rulebook values feed in
    // later — for now these are proposals marked in the description.
    await prisma.goal.deleteMany({});
    const goalTemplates: Array<{ title: string; path: string; template: any }> = [
      { title: 'Attend your first class of the day', path: 'Scholar', template: { reward: 30 } },
      { title: 'Spend 30 minutes in the Library', path: 'Scholar', template: { reward: 25, venue: 'Library' } },
      { title: 'Eat lunch at the canteen', path: 'Social', template: { reward: 15, venue: 'Multipurpose Hall' } },
      { title: 'Say hello to one new person', path: 'Social', template: { reward: 20 } },
      { title: 'Attend 12:10 mass', path: 'Faith', template: { reward: 50, startTime: '12:10' } },
      { title: 'Take a haircut before inspection', path: 'Athlete', template: { reward: 0, avoids: 'overdue_fine' } },
      { title: 'Wrap up the hustle before 22:00', path: 'Leader', template: { reward: 40 } },
      { title: 'Trade at the hostel front 18:00–22:00', path: 'Leader', template: { reward: 60, startTime: '18:00' } },
    ];
    for (const g of goalTemplates) {
      await prisma.goal.create({
        data: {
          title: g.title,
          cadence: 'daily',
          path: g.path,
          template: JSON.stringify(g.template),
          isActive: true,
        },
      });
    }
    console.log(`[seed] goal templates inserted: ${goalTemplates.length}`);

    // ---------- Demo announcements (for the Home strip) ----------
    await prisma.announcement.deleteMany({});
    const announcements: Array<{ title: string; body: string; category: string; pinned?: boolean }> = [
      {
        title: 'Faculty mass — Monday 12:10 at the Chapel',
        body: 'Compulsory for NAS. 500 CC fine + warning meter if you miss it.',
        category: 'spiritual',
        pinned: true,
      },
      {
        title: 'Hair inspection at the gate this week',
        body: 'Security officers are running checks. Get a haircut at the on-campus barber (150–250 CC).',
        category: 'safety',
      },
      {
        title: 'Power cut yesterday — water restored by 6pm',
        body: 'If your phone died, the library has charging points during opening hours.',
        category: 'general',
      },
      {
        title: 'Hustle window opens 18:00 at the hostel fronts',
        body: 'Vendors hand out stock on consignment. Stop by 22:00 — the hostels lock at 22:00.',
        category: 'social',
      },
      {
        title: 'CSC201 assignment due Friday',
        body: 'Submit at the bookshop (pin 35). Long queues expected on short notice.',
        category: 'academic',
      },
    ];
    for (const a of announcements) {
      await prisma.announcement.create({
        data: {
          title: a.title,
          body: a.body,
          category: a.category,
          isPinned: a.pinned ?? false,
          startsAt: new Date(),
        },
      });
    }
    console.log(`[seed] announcements inserted: ${announcements.length}`);

    // ---------- Demo student's wallet (1,200 CC weekly allowance via ledger) ----------
    // HARD RULE: balance is recomputed from ledger. We insert ONE ledger entry
    // (weekly_allowance) and the wallet adapter will sum it on read.
    await prisma.ledger.deleteMany({ where: { toUser: student.id } });
    await prisma.wallet.deleteMany({ where: { userId: student.id } });
    await prisma.ledger.create({
      data: {
        fromUser: null,
        toUser: student.id,
        amount: 12000,
        reason: 'weekly_allowance',
        metadata: JSON.stringify({ week: 'demo', note: 'Pocket money from home (demo)' }),
      },
    });
    // Create the wallet row so reads don't have to lazy-create.
    // The wallet adapter will recompute balance from ledger on read.
    await prisma.wallet.create({
      data: { userId: student.id, balance: 12000, earnedToday: 0, earnedTodayDate: new Date() },
    });
    console.log(`[seed] demo wallet seeded: 1,200 CC weekly allowance via ledger`);

    // ---------- Demo student's hair_state (Fresh) ----------
    await prisma.hairState.deleteMany({ where: { userId: student.id } });
    await prisma.hairState.create({
      data: { userId: student.id, stage: 'Fresh', lastCutAt: new Date() },
    });
    console.log(`[seed] demo hair_state seeded: Fresh`);

    // ---------- Stats: zero out any previous stats rows for the demo student ----------
    await prisma.stat.deleteMany({ where: { userId: student.id } });
    for (const p of ['Scholar','Social','Faith','Athlete','Creative','Leader']) {
      await prisma.stat.create({
        data: { userId: student.id, path: p, xp: 0 },
      });
    }
    console.log(`[seed] demo stats seeded: all six paths at 0 XP`);

    // ---------- Discipline: clean (no entries) ----------
    await prisma.discipline.deleteMany({ where: { userId: student.id } });

    // ---------- Items (food table) — Phase 4 ----------
    // Reference prices from the design doc (in naira), converted to CC at
    // 1 CC = 10 naira (config: cc_to_naira_ratio). All prices live in the
    // items table; nothing hardcoded in app code.
    await prisma.item.deleteMany({});
    const itemsSeed: Array<{ code: string; name: string; category: string; basePrice: number; metadata?: any }> = [
      { code: 'rice_stew_sausage',  name: 'Rice and stew with sausage',       category: 'meal',  basePrice: 800, metadata: { naira: 800, kind: 'meal' } },
      { code: 'fried_rice_egg',    name: 'Fried rice with egg',               category: 'meal',  basePrice: 800, metadata: { naira: 800, kind: 'meal' } },
      { code: 'bread_egg',         name: 'Bread and egg',                     category: 'small', basePrice: 600, metadata: { naira: 600, kind: 'small_meal' } },
      { code: 'bread_two_eggs',    name: 'Bread with two fried eggs',         category: 'small', basePrice: 800, metadata: { naira: 800, kind: 'small_meal' } },
      { code: 'pancakes',          name: 'Pancakes',                          category: 'snack', basePrice: 500, metadata: { naira_range: '500-600', kind: 'snack' } },
      { code: 'custard_pie',       name: 'Custard pie',                       category: 'snack', basePrice: 150, metadata: { naira: 150, kind: 'snack' } },
      { code: 'gala',              name: 'Gala',                              category: 'snack', basePrice: 175, metadata: { naira_range: '150-200', kind: 'snack' } },
      { code: 'pepsi_sprite',      name: 'Pepsi or Sprite',                   category: 'drink', basePrice: 300, metadata: { naira: 300, kind: 'drink' } },
      { code: 'nutri_milk',        name: 'Nutri Milk (yogurt drink)',         category: 'drink', basePrice: 400, metadata: { naira: 400, kind: 'drink' } },
      // Service item
      { code: 'haircut_campus',    name: 'Haircut (campus barber)',           category: 'service', basePrice: 2000, metadata: { naira_range: '1500-2500', kind: 'service' } },
    ];
    for (const it of itemsSeed) {
      await prisma.item.create({
        data: {
          code: it.code,
          name: it.name,
          category: it.category,
          basePrice: it.basePrice,
          metadata: JSON.stringify(it.metadata ?? {}),
        },
      });
    }
    console.log(`[seed] items seeded: ${itemsSeed.length} (food + service)`);

    // ---------- Second demo student (for Phase 5 social flow testing) ----------
    // Different department so "Someone from [dept]" is distinguishable.
    const lawDept = await prisma.department.upsert({
      where: { code: 'LAW' },
      update: {},
      create: { code: 'LAW', name: 'Law (demo)', faculty: 'Law' },
    });
    const student2Email = 'student2.demo@vuna-life.local';
    const student2 = await prisma.user.upsert({
      where: { email: student2Email },
      update: {},
      create: {
        email: student2Email,
        username: 'demo_law_student',
        displayName: 'Tobi A.',
        role: 'student',
        departmentId: lawDept.id,
        level: 300,
        isVerifiedStudent: true,
      },
    });
    // Seed student2's wallet with 1200 CC + hair Fresh + stats
    await prisma.ledger.deleteMany({ where: { toUser: student2.id } });
    await prisma.wallet.deleteMany({ where: { userId: student2.id } });
    await prisma.ledger.create({
      data: {
        fromUser: null, toUser: student2.id, amount: 1500,
        reason: 'weekly_allowance', metadata: JSON.stringify({ week: 'demo' }),
      },
    });
    await prisma.wallet.create({
      data: { userId: student2.id, balance: 1500, earnedToday: 0, earnedTodayDate: new Date() },
    });
    await prisma.hairState.upsert({
      where: { userId: student2.id },
      update: { stage: 'Fresh', lastCutAt: new Date() },
      create: { userId: student2.id, stage: 'Fresh', lastCutAt: new Date() },
    });
    await prisma.stat.deleteMany({ where: { userId: student2.id } });
    for (const p of ['Scholar','Social','Faith','Athlete','Creative','Leader']) {
      await prisma.stat.create({ data: { userId: student2.id, path: p, xp: 0 } });
    }
    await prisma.discipline.deleteMany({ where: { userId: student2.id } });
    await prisma.userGoal.deleteMany({ where: { userId: student2.id } });
    console.log(`[seed] second demo student ${student2.email} seeded (Law, 300 level)`);

    // Phase 4 anomaly detection config keys
    await prisma.config.upsert({
      where: { key: 'anomaly_cap_breach_multiplier' },
      update: { value: '1.5' },
      create: { key: 'anomaly_cap_breach_multiplier', value: '1.5', description: 'If earned_today > cap × this multiplier, freeze the account.' },
    });
    await prisma.config.upsert({
      where: { key: 'anomaly_max_goal_reward' },
      update: { value: '100' },
      create: { key: 'anomaly_max_goal_reward', value: '100', description: 'No single goal_reward entry may exceed this.' },
    });
    await prisma.config.upsert({
      where: { key: 'anomaly_max_hustle_sale' },
      update: { value: '500' },
      create: { key: 'anomaly_max_hustle_sale', value: '500', description: 'No single hustle_sale entry may exceed this.' },
    });

    // Phase 6 config: gate + hustle + feedback
    await prisma.config.upsert({
      where: { key: 'hustle_window_start' },
      update: { value: '"18:00"' },
      create: { key: 'hustle_window_start', value: '"18:00"', description: 'Evening hustle window start (server time).' },
    });
    await prisma.config.upsert({
      where: { key: 'hustle_window_end' },
      update: { value: '"22:00"' },
      create: { key: 'hustle_window_end', value: '"22:00"', description: 'Evening hustle window end (server time).' },
    });
    await prisma.config.upsert({
      where: { key: 'hustle_max_attempts_per_evening' },
      update: { value: '3' },
      create: { key: 'hustle_max_attempts_per_evening', value: '3', description: 'Max hustle attempts per evening window.' },
    });
    await prisma.config.upsert({
      where: { key: 'hustle_price_variance_pct' },
      update: { value: '20' },
      create: { key: 'hustle_price_variance_pct', value: '20', description: 'Allowed variance ±N% from the suggested price.' },
    });
    await prisma.config.upsert({
      where: { key: 'feedback_rate_limit_hours' },
      update: { value: '24' },
      create: { key: 'feedback_rate_limit_hours', value: '24', description: 'Hours between feedback submissions per user.' },
    });
    await prisma.config.upsert({
      where: { key: 'feedback_max_chars' },
      update: { value: '140' },
      create: { key: 'feedback_max_chars', value: '140', description: 'Max characters in feedback body.' },
    });

    // ---------- Phase 7: wardrobe items (30+ items) ----------
    // All prices in Naira. No real brand names — "inspired by" only.
    // HARD RULE: No real brand logos in SVG.
    await prisma.wardrobeItem.deleteMany({});
    const wardrobeSeed: Array<{ name: string; category: string; variant: string; price: number; layer: number; isDesigner?: boolean; description?: string }> = [
      // Shirts (outfit_top, layer 3)
      { name: 'White button-down', category: 'outfit_top', variant: 'white_button_down', price: 3500, layer: 3, description: 'Clean white shirt for lectures.' },
      { name: 'Navy polo', category: 'outfit_top', variant: 'navy_polo', price: 2800, layer: 3, description: 'Smart-casual navy polo.' },
      { name: 'Lagos streetwear hoodie', category: 'outfit_top', variant: 'lagos_streetwear_hoodie', price: 8000, layer: 3, description: 'Street-ready hoodie for the hustle.' },
      { name: 'Ankara print shirt', category: 'outfit_top', variant: 'ankara_print_shirt', price: 6500, layer: 3, description: 'Vibrant Ankara print.' },
      { name: 'Designer polo', category: 'outfit_top', variant: 'gucci_inspired_polo', price: 45000, layer: 3, isDesigner: true, description: 'Luxury-inspired polo. Flex with care.' },
      // Trousers (outfit_bottom, layer 4)
      { name: 'Black chinos', category: 'outfit_bottom', variant: 'black_chinos', price: 4000, layer: 4, description: 'Versatile black chinos.' },
      { name: 'Cargo pants', category: 'outfit_bottom', variant: 'cargo_pants', price: 5500, layer: 4, description: 'Street cargo pants.' },
      { name: 'Ankara trousers', category: 'outfit_bottom', variant: 'ankara_trousers', price: 7000, layer: 4, description: 'Matching Ankara trousers.' },
      { name: 'Designer joggers', category: 'outfit_bottom', variant: 'balenciaga_inspired_joggers', price: 55000, layer: 4, isDesigner: true, description: 'Luxury-inspired joggers.' },
      // Shoes (layer 5)
      { name: 'White sneakers', category: 'shoes', variant: 'white_sneakers', price: 12000, layer: 5, description: 'Crisp white sneakers.' },
      { name: 'Brown loafers', category: 'shoes', variant: 'brown_loafers', price: 8500, layer: 5, description: 'Smart brown loafers.' },
      { name: 'Slides', category: 'shoes', variant: 'slides', price: 2500, layer: 5, description: 'Easy slides for the hostel.' },
      { name: 'Designer sneakers', category: 'shoes', variant: 'yeezy_inspired_sneakers', price: 65000, layer: 5, isDesigner: true, description: 'Luxury-inspired sneakers.' },
      // Chains (accessory_1, layer 6)
      { name: 'Gold chain', category: 'accessory_1', variant: 'gold_chain', price: 3000, layer: 6, description: 'Simple gold chain.' },
      { name: 'Silver chain', category: 'accessory_1', variant: 'silver_chain', price: 1800, layer: 6, description: 'Simple silver chain.' },
      { name: 'Rosary', category: 'accessory_1', variant: 'rosary', price: 500, layer: 6, description: 'Faith pathway rosary bead.' },
      // Watches (accessory_2, layer 7)
      { name: 'Casio-style watch', category: 'accessory_2', variant: 'casio_style', price: 4500, layer: 7, description: 'Reliable digital watch.' },
      { name: 'Designer watch', category: 'accessory_2', variant: 'ap_inspired', price: 120000, layer: 7, isDesigner: true, description: 'Luxury-inspired timepiece. Big flex.' },
      // Glasses (accessory_3, layer 8)
      { name: 'Round frames', category: 'accessory_3', variant: 'round_frames', price: 2000, layer: 8, description: 'Stylish round glasses.' },
      { name: 'Shades', category: 'accessory_3', variant: 'shades', price: 3500, layer: 8, description: 'Dark sunglasses.' },
    ];
    for (const w of wardrobeSeed) {
      await prisma.wardrobeItem.create({
        data: {
          name: w.name,
          category: w.category,
          variant: w.variant,
          price: w.price,
          layer: w.layer,
          description: w.description ?? null,
          isDesigner: w.isDesigner ?? false,
        },
      });
    }
    console.log(`[seed] wardrobe items inserted: ${wardrobeSeed.length}`);

    // Phase 7: Naira + background config
    await prisma.config.upsert({ where: { key: 'parent_transfer_hustler_min' }, update: { value: '50000' }, create: { key: 'parent_transfer_hustler_min', value: '50000', description: 'Monthly transfer min for hustler.' } });
    await prisma.config.upsert({ where: { key: 'parent_transfer_hustler_max' }, update: { value: '70000' }, create: { key: 'parent_transfer_hustler_max', value: '70000', description: 'Monthly transfer max for hustler.' } });
    await prisma.config.upsert({ where: { key: 'parent_transfer_comfortable_min' }, update: { value: '50000' }, create: { key: 'parent_transfer_comfortable_min', value: '50000', description: 'Monthly transfer min for comfortable.' } });
    await prisma.config.upsert({ where: { key: 'parent_transfer_comfortable_max' }, update: { value: '150000' }, create: { key: 'parent_transfer_comfortable_max', value: '150000', description: 'Monthly transfer max for comfortable.' } });
    await prisma.config.upsert({ where: { key: 'parent_transfer_blessed_min' }, update: { value: '200000' }, create: { key: 'parent_transfer_blessed_min', value: '200000', description: 'Monthly transfer min for blessed.' } });
    await prisma.config.upsert({ where: { key: 'parent_transfer_blessed_max' }, update: { value: '400000' }, create: { key: 'parent_transfer_blessed_max', value: '400000', description: 'Monthly transfer max for blessed.' } });
    await prisma.config.upsert({ where: { key: 'background_hustler_weight' }, update: { value: '0.40' }, create: { key: 'background_hustler_weight', value: '0.40', description: 'P(hustler).' } });
    await prisma.config.upsert({ where: { key: 'background_comfortable_weight' }, update: { value: '0.45' }, create: { key: 'background_comfortable_weight', value: '0.45', description: 'P(comfortable).' } });
    await prisma.config.upsert({ where: { key: 'background_blessed_weight' }, update: { value: '0.15' }, create: { key: 'background_blessed_weight', value: '0.15', description: 'P(blessed).' } });

    console.log(`[seed] demo user ${student.email} + Phase 4 sample data seeded`);
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
