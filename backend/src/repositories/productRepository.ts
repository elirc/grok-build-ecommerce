// =============================================================================
// PRODUCT REPOSITORY
// =============================================================================
//
// Data access layer. Keeps Prisma usage isolated.
// =============================================================================

import { prisma } from '../lib/prisma';

export async function findAll() {
  return prisma.product.findMany();
}

export async function create(data: any) {
  return prisma.product.create({ data });
}
