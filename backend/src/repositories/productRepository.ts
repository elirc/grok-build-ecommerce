import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { Actor, requireAdmin } from "../middleware/auth";
import { ProductInput, ProductList, identity } from "../lib/validation";
import {
  Tx,
  audit,
  literal,
  ordered,
  conflict,
  productDto,
} from "../lib/domain";
async function rowIn(tx: Tx, value: Actor, id: string) {
  identity.parse(value.id);
  const row = await tx.product.findFirst({
    where: {
      id: identity.parse(id),
      ...(value.role === "ADMIN" ? {} : { active: true }),
    },
  });
  if (!row) throw new AppError(404, "Product not found.");
  return row;
}
export async function findAll(value: Actor, query: ProductList) {
  identity.parse(value.id);
  if (value.role !== "ADMIN" && query.active !== "true")
    throw new AppError(
      403,
      "Only administrators can review archived products.",
    );
  const where: Prisma.ProductWhereInput = {
    ...(query.active ? { active: query.active === "true" } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: literal(query.q), mode: "insensitive" } },
            { sku: { contains: literal(query.q), mode: "insensitive" } },
            { category: { contains: literal(query.q), mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return prisma.$transaction(
    async (tx) => ({
      items: (
        await tx.product.findMany({
          where,
          orderBy: ordered,
          skip: (query.page - 1) * 20,
          take: 20,
        })
      ).map(productDto),
      total: await tx.product.count({ where }),
      page: query.page,
      pageSize: 20,
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export const find = async (value: Actor, id: string) =>
  productDto(await rowIn(prisma, value, id));
export async function create(value: Actor, input: ProductInput) {
  requireAdmin(value);
  return prisma.$transaction(async (tx) => {
    const row = await tx.product.create({
      data: { ...input, price: new Prisma.Decimal(input.price) },
    });
    await audit(tx, value, "PRODUCT", row.id, "CREATE", row.version);
    return productDto(row);
  });
}
export async function update(
  value: Actor,
  id: string,
  expected: number,
  input: ProductInput,
) {
  requireAdmin(value);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.product.updateMany({
      where: { id, version: expected },
      data: {
        ...input,
        price: new Prisma.Decimal(input.price),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      await rowIn(tx, value, id);
      throw conflict();
    }
    await audit(tx, value, "PRODUCT", id, "UPDATE", expected + 1);
    return productDto(await rowIn(tx, value, id));
  });
}
export async function remove(value: Actor, id: string, expected: number) {
  requireAdmin(value);
  return prisma.$transaction(async (tx) => {
    const removed = await tx.product.deleteMany({
      where: { id, version: expected, orderItems: { none: {} } },
    });
    if (removed.count !== 1) {
      const row = await rowIn(tx, value, id);
      if (row.version !== expected) throw conflict();
      throw new AppError(
        409,
        "This product appears in order history. Archive it instead of deleting it.",
      );
    }
    await audit(tx, value, "PRODUCT", id, "DELETE", expected + 1);
    return { id };
  });
}
export function history(value: Actor, id: string) {
  requireAdmin(value);
  return prisma.auditEvent.findMany({
    where: { resourceType: "PRODUCT", resourceId: identity.parse(id) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
  });
}
