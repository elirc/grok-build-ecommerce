// =============================================================================
// ORDER REPOSITORY
// =============================================================================

import { prisma } from '../lib/prisma';

export async function findAll() {
  return prisma.order.findMany({ include: { items: true } });
}

export async function create(data: any) {
  return prisma.order.create({ data });
}
