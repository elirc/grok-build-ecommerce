// =============================================================================
// PRISMA CLIENT SINGLETON
// =============================================================================
//
// Best practice in Node.js applications.
// Prevents multiple Prisma instances which can exhaust database connections.
//
// In development with ts-node-dev, we attach to global to survive hot reloads.
// =============================================================================

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
