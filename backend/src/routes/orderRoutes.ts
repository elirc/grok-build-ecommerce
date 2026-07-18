// =============================================================================
// ORDER ROUTES
// =============================================================================
//
// Checkout and order management.
//
// Critical learning area: Transactions for inventory + order creation.
// =============================================================================

import { Router } from 'express';
import * as orderService from '../services/orderService';

const router = Router();

// Get orders (for demo - would be user-specific)
router.get('/', async (req, res) => {
  const orders = await orderService.getAllOrders();
  res.json({ data: orders });
});

// Checkout (simplified)
router.post('/checkout', async (req, res) => {
  try {
    const { userId, items } = req.body; // items: [{productId, quantity}]
    const order = await orderService.createOrder(userId, items);
    res.status(201).json({ data: order });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Checkout failed' });
  }
});

export default router;
