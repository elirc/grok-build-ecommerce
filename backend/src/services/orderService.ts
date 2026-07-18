// =============================================================================
// ORDER SERVICE
// =============================================================================
//
// This is where critical business logic lives.
//
// IMPORTANT: In real e-commerce, creating an order involves:
// 1. Checking inventory
// 2. Decrementing stock
// 3. Creating order + order items
// 4. All in a database transaction
//
// We demonstrate the structure here. Expand with actual transaction in Phase 2.
// =============================================================================

import { prisma } from '../lib/prisma';

export async function getAllOrders() {
  return prisma.order.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createOrder(userId: string, items: any[]) {
  // TODO: Wrap in transaction
  // TODO: Check and decrement stock
  // TODO: Calculate total

  // Simplified for now
  const order = await prisma.order.create({
    data: {
      userId,
      status: 'PENDING',
      total: 0, // will calculate in real impl
      items: {
        create: items.map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: 0, // lookup from product in real code
        })),
      },
    },
  });

  return order;
}
