// =============================================================================
// PRODUCT SERVICE
// =============================================================================
//
// Business logic for products.
//
// In real e-commerce:
// - Inventory management
// - Search indexing
// - Category logic
//
// Here we keep it focused on core CRUD with comments on expansion points.
// =============================================================================

import { prisma } from '../lib/prisma';

export async function getAllProducts() {
  return prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function createProduct(data: {
  name: string;
  price: number;
  stock?: number;
  category?: string;
}) {
  return prisma.product.create({ data });
}
