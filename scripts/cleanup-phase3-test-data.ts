// Run with: bun run scripts/cleanup-phase3-test-data.ts
// Cleans up test sessions + attendance rows so the demo student starts fresh.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  await db.attendance.deleteMany({});
  await db.session.deleteMany({});

  const student = await db.user.findUnique({ where: { email: 'student.demo@vuna-life.local' } });
  if (student) {
    // Reset the wallet to seed state (1200 CC starting balance via ledger).
    await db.ledger.deleteMany({ where: { OR: [{ fromUser: student.id }, { toUser: student.id }] } });
    await db.ledger.create({
      data: {
        fromUser: null,
        toUser: student.id,
        amount: 1200,
        reason: 'weekly_allowance',
        metadata: JSON.stringify({ week: 'demo', note: 'Pocket money from home (demo)' }),
      },
    });
    await db.wallet.update({
      where: { userId: student.id },
      data: { balance: 1200, earnedToday: 0, earnedTodayDate: new Date() },
    });
    // Reset goals so the goals engine re-assigns today's set
    await db.userGoal.deleteMany({ where: { userId: student.id } });
    // Reset stats
    await db.stat.deleteMany({ where: { userId: student.id } });
    for (const p of ['Scholar','Social','Faith','Athlete','Creative','Leader']) {
      await db.stat.create({ data: { userId: student.id, path: p, xp: 0 } });
    }
    // Reset discipline
    await db.discipline.deleteMany({ where: { userId: student.id } });
    // Reset hair
    await db.hairState.upsert({
      where: { userId: student.id },
      update: { stage: 'Fresh', lastCutAt: new Date() },
      create: { userId: student.id, stage: 'Fresh', lastCutAt: new Date() },
    });
  }
  console.log('cleanup done');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
