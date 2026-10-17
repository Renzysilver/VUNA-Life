import { PrismaClient } from '@prisma/client';

// Single shared PrismaClient across hot reloads in dev. Avoids exhausting the
// SQLite connection pool when Next.js re-evaluates modules.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
