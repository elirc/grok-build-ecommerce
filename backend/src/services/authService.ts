import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { loginInput, registrationInput } from "../lib/validation";
const dummy = bcrypt.hashSync("synthetic-unused-login-password", 10);
export async function loginUser(value: unknown) {
  const data = loginInput.parse(value),
    user = await prisma.user.findUnique({ where: { email: data.email } });
  const matches = await bcrypt.compare(
    data.password,
    user?.passwordHash || dummy,
  );
  if (!user || !matches || !user.active)
    throw new AppError(401, "Email or password was not accepted.");
  return user.id;
}
export async function registerUser(value: unknown) {
  const data = registrationInput.parse(value),
    passwordHash = await bcrypt.hash(data.password, 10);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: "CUSTOMER",
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          resourceType: "USER",
          resourceId: user.id,
          action: "REGISTER",
          version: 1,
        },
      });
      return user.id;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new AppError(
        409,
        "An account already uses that email. Sign in instead.",
      );
    throw error;
  }
}
