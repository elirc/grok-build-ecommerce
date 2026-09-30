import { Router } from "express";
import * as service from "../services/orderService";
import { actor } from "../middleware/auth";
import { asyncRoute } from "../lib/errors";
const router = Router();
router.get(
  "/",
  asyncRoute(async (req, res) =>
    res.json(await service.getAllOrders(actor(req), req.query)),
  ),
);
router.post(
  "/checkout",
  asyncRoute(async (req, res) => {
    const result = await service.createOrder(actor(req), req.body);
    res
      .location("/api/orders/" + result.order.id)
      .status(result.replayed ? 200 : 201)
      .json(result);
  }),
);
router.get(
  "/:id",
  asyncRoute(async (req, res) =>
    res.json(await service.getOrder(actor(req), req.params.id)),
  ),
);
router.patch(
  "/:id/status",
  asyncRoute(async (req, res) =>
    res.json(
      await service.transitionOrder(actor(req), req.params.id, req.body),
    ),
  ),
);
router.get(
  "/:id/audit",
  asyncRoute(async (req, res) =>
    res.json({ items: await service.history(actor(req), req.params.id) }),
  ),
);
export default router;
