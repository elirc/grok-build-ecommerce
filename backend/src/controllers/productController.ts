import { Request, Response } from "express";
import * as service from "../services/productService";
import { actor } from "../middleware/auth";
export async function getProducts(req: Request, res: Response) {
  res.json(await service.getAllProducts(actor(req), req.query));
}
export async function createProduct(req: Request, res: Response) {
  const row = await service.createProduct(actor(req), req.body);
  res
    .location("/api/products/" + row.id)
    .status(201)
    .json(row);
}
