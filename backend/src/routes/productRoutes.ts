import { Router } from "express";
import * as controller from "../controllers/productController";
import * as service from "../services/productService";
import { actor } from "../middleware/auth";
import { asyncRoute } from "../lib/errors";
const router = Router();
router.get("/", asyncRoute(controller.getProducts));
router.post("/", asyncRoute(controller.createProduct));
router.get(
  "/:id",
  asyncRoute(async (req, res) =>
    res.json(await service.getProduct(actor(req), req.params.id)),
  ),
);
router.put(
  "/:id",
  asyncRoute(async (req, res) =>
    res.json(await service.updateProduct(actor(req), req.params.id, req.body)),
  ),
);
router.delete(
  "/:id",
  asyncRoute(async (req, res) =>
    res.json(await service.deleteProduct(actor(req), req.params.id, req.body)),
  ),
);
router.get(
  "/:id/audit",
  asyncRoute(async (req, res) =>
    res.json({ items: await service.history(actor(req), req.params.id) }),
  ),
);
export default router;
