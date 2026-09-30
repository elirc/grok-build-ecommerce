import { Router } from "express";
import { loginUser, registerUser } from "../services/authService";
import { issueToken, currentUser } from "../middleware/auth";
import { AppError, asyncRoute } from "../lib/errors";
export default function authRoutes(secret: string) {
  const router = Router(),
    attempts = new Map<string, { count: number; until: number }>();
  router.use((req, res, next) => {
    const now = Date.now(),
      key = req.ip || "local";
    for (const [ip, entry] of attempts)
      if (entry.until <= now) attempts.delete(ip);
    const entry = attempts.get(key) || {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    if (entry.count >= 20 || (!attempts.has(key) && attempts.size >= 1000)) {
      res.setHeader("Retry-After", "900");
      return next(
        new AppError(
          429,
          "Too many sign-in or registration attempts. Try again in fifteen minutes.",
        ),
      );
    }
    entry.count++;
    attempts.set(key, entry);
    next();
  });
  router.post(
    "/login",
    asyncRoute(async (req, res) => {
      const id = await loginUser(req.body);
      res.json({ token: issueToken(id, secret), user: await currentUser(id) });
    }),
  );
  router.post(
    "/register",
    asyncRoute(async (req, res) => {
      const id = await registerUser(req.body);
      res
        .status(201)
        .json({ token: issueToken(id, secret), user: await currentUser(id) });
    }),
  );
  return router;
}
