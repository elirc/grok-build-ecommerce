import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { Actor, orderScope, requireAdmin } from "../middleware/auth";
import {
  CheckoutInput,
  OrderList,
  TransitionInput,
  identity,
} from "../lib/validation";
import {
  Tx,
  audit,
  literal,
  ordered,
  conflict,
  orderDetails,
  orderDto,
} from "../lib/domain";
const sortedItems = (input: CheckoutInput) =>
  [...input.items].sort((a, b) =>
    a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
  );
export const fingerprint = (input: CheckoutInput) =>
  createHash("sha256")
    .update(JSON.stringify(sortedItems(input)))
    .digest("hex");
async function rowIn(tx: Tx, value: Actor, id: string) {
  const row = await tx.order.findFirst({
    where: { id: identity.parse(id), ...orderScope(value) },
    include: orderDetails,
  });
  if (!row) throw new AppError(404, "Order not found.");
  return row;
}
async function lockProduct(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} FOR UPDATE`;
  const row = await tx.product.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "A requested product was not found.");
  return row;
}
export async function findAll(value: Actor, query: OrderList) {
  const where: Prisma.OrderWhereInput = {
    ...orderScope(value),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { id: { contains: literal(query.q), mode: "insensitive" } },
            {
              items: {
                some: {
                  productName: {
                    contains: literal(query.q),
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  return prisma.$transaction(
    async (tx) => ({
      items: (
        await tx.order.findMany({
          where,
          include: orderDetails,
          orderBy: ordered,
          skip: (query.page - 1) * 20,
          take: 20,
        })
      ).map(orderDto),
      total: await tx.order.count({ where }),
      page: query.page,
      pageSize: 20,
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export const find = async (value: Actor, id: string) =>
  orderDto(await rowIn(prisma, value, id));
export async function checkout(value: Actor, input: CheckoutInput) {
  orderScope(value);
  const hash = fingerprint(input),
    items = sortedItems(input);
  return prisma.$transaction(
    async (tx) => {
      // Serialize the same customer's key before inspecting its durable receipt.
      const lockKey = value.id + ":" + input.requestId;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
      const existing = await tx.order.findUnique({
        where: {
          userId_checkoutKey: {
            userId: value.id,
            checkoutKey: input.requestId,
          },
        },
        include: orderDetails,
      });
      if (existing) {
        if (existing.requestHash !== hash)
          throw new AppError(
            409,
            "This checkout key was already used for different items. Review the original order.",
          );
        return { order: orderDto(existing), replayed: true };
      }
      let total = new Prisma.Decimal(0);
      const lines: {
        productId: string;
        productName: string;
        productSku: string;
        quantity: number;
        price: Prisma.Decimal;
        version: number;
      }[] = [];
      for (const item of items) {
        const product = await lockProduct(tx, item.productId);
        if (!product.active)
          throw new AppError(
            409,
            "A product was archived. Review the cart before starting a new checkout.",
          );
        if (product.stock < item.quantity)
          throw new AppError(
            409,
            "Insufficient stock for " +
              product.name +
              ". Review the cart before starting a new checkout.",
          );
        if (product.version >= 2147483647) throw conflict();
        total = total.add(product.price.mul(item.quantity));
        lines.push({
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          price: product.price,
          version: product.version,
        });
      }
      if (total.gt("9999999999.99"))
        throw new AppError(400, "Order total exceeds the supported limit.");
      const row = await tx.order.create({
        data: {
          userId: value.id,
          checkoutKey: input.requestId,
          requestHash: hash,
          total,
          items: { create: lines.map(({ version, ...line }) => line) },
        },
        include: orderDetails,
      });
      for (const line of lines) {
        const reserved = await tx.product.updateMany({
          where: {
            id: line.productId,
            version: line.version,
            stock: { gte: line.quantity },
            active: true,
          },
          data: {
            stock: { decrement: line.quantity },
            version: { increment: 1 },
          },
        });
        if (reserved.count !== 1) throw conflict();
        await audit(
          tx,
          value,
          "PRODUCT",
          line.productId,
          "RESERVE",
          line.version + 1,
          row.id,
        );
      }
      await audit(tx, value, "ORDER", row.id, "CHECKOUT", row.version, row.id);
      return { order: orderDto(row), replayed: false };
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function transition(
  value: Actor,
  id: string,
  input: TransitionInput,
) {
  orderScope(value);
  if (input.status !== "CANCELLED") requireAdmin(value);
  return prisma.$transaction(
    async (tx) => {
      await rowIn(tx, value, id);
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
      const row = await rowIn(tx, value, id);
      if (row.version !== input.version) throw conflict();
      const next: Record<string, string[]> = {
        PENDING: ["PAID", "CANCELLED"],
        PAID: ["SHIPPED"],
        SHIPPED: ["DELIVERED"],
        DELIVERED: [],
        CANCELLED: [],
      };
      if (!next[row.status].includes(input.status))
        throw new AppError(
          409,
          "This order cannot make that transition. Only pending orders can be cancelled.",
        );
      if (input.status === "CANCELLED")
        for (const item of [...row.items].sort((a, b) =>
          a.productId < b.productId ? -1 : 1,
        )) {
          const product = await lockProduct(tx, item.productId);
          if (product.stock + item.quantity > 1000000)
            throw new AppError(
              409,
              "Restoring stock would exceed its limit. An administrator must review inventory first.",
            );
          if (product.version >= 2147483647) throw conflict();
          await tx.product.update({
            where: { id: product.id },
            data: {
              stock: { increment: item.quantity },
              version: { increment: 1 },
            },
          });
          await audit(
            tx,
            value,
            "PRODUCT",
            product.id,
            "RESTORE",
            product.version + 1,
            row.id,
          );
        }
      const changed = await tx.order.updateMany({
        where: { id, version: input.version, status: row.status },
        data: { status: input.status, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict();
      await audit(
        tx,
        value,
        "ORDER",
        id,
        input.status === "PAID" ? "DEMO_PAYMENT" : input.status,
        input.version + 1,
        id,
      );
      return orderDto(await rowIn(tx, value, id));
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function history(value: Actor, id: string) {
  await rowIn(prisma, value, id);
  return prisma.auditEvent.findMany({
    where: { resourceType: "ORDER", resourceId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
  });
}
