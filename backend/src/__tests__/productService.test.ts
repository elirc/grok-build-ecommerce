/**
 * Example unit test for product service.
 * 
 * Focus: Testing business logic in isolation (mid-level skill).
 */

import * as productService from '../services/productService';
import { vi } from 'vitest';

vi.mock('../repositories/productRepository', () => ({
  findAll: vi.fn().mockResolvedValue([{ id: '1', name: 'Test', price: 10 }]),
  create: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
}));

describe('productService', () => {
  it('should return products', async () => {
    const products = await productService.getAllProducts();
    expect(products.length).toBeGreaterThan(0);
  });
});
