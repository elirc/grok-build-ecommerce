import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { identity } from "../lib/validation";
export type Actor = { id: string; role: "CUSTOMER" | "ADMIN" };
export const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;
export function validateSecret(secret: string) {
  if (
    Buffer.byteLength(secret) < 32 ||
    /^(change|replace|example|your[-_ ])/i.test(secret)
  )
    throw new Error(
      "JWT_SECRET must be generated and contain at least 32 bytes.",
    );
}
export const issueToken = (id: string, secret: string) =>
  jwt.sign({}, secret, {
    subject: id,
    algorithm: "HS256",
    issuer: "commerce-workspace",
    audience: "commerce-workspace-web",
    expiresIn: "30m",
  });
export async function currentUser(id: string) {
  const user = await prisma.user.findFirst({
    where: { id: identity.parse(id), active: true },
    select: publicUser,
  });
  if (!user) throw new AppError(401, "Sign in again to continue.");
  return user;
}
export function authenticate(secret: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ") || header.length > 2048)
        throw new AppError(401, "Sign in to continue.");
      let subject: string;
      try {
        const payload = jwt.verify(header.slice(7), secret, {
          algorithms: ["HS256"],
          issuer: "commerce-workspace",
          audience: "commerce-workspace-web",
        }) as JwtPayload;
        subject = identity.parse(payload.sub);
      } catch {
        throw new AppError(
          401,
          "Sign in again to continue. Export pending work first.",
        );
      }
      const user = await currentUser(subject);
      req.actor = { id: user.id, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}
export function actor(req: Request) {
  if (!req.actor) throw new AppError(401, "Verified identity is required.");
  return req.actor;
}
export function requireAdmin(value: Actor) {
  identity.parse(value.id);
  if (value.role !== "ADMIN")
    throw new AppError(
      403,
      "An administrator must change the product catalogue or advance fulfillment.",
    );
}
export function orderScope(value: Actor) {
  identity.parse(value.id);
  if (value.role === "ADMIN") return {};
  if (value.role === "CUSTOMER") return { userId: value.id };
  throw new AppError(403, "Unknown account role.");
}
declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
      requestId: string;
    }
  }
}
