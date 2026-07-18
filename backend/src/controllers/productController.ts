// =============================================================================
// PRODUCT CONTROLLER
// =============================================================================
//
// Thin controller layer. Delegates to service.
// =============================================================================

import { Request, Response } from 'express';
import * as productService from '../services/productService';

export async function getProducts(req: Request, res: Response) {
  const products = await productService.getAllProducts();
  res.json({ data: products });
}

export async function createProduct(req: Request, res: Response) {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ data: product });
}
