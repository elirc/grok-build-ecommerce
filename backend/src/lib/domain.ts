import { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import { Actor } from "../middleware/auth";
export type Tx = Prisma.TransactionClient;
export const literal = (value: string) =>
  value.replace(/[\\%_]/g, (char) => "\\" + char);
export const ordered = [{ createdAt: "desc" as const }, { id: "asc" as const }];
export const conflict = () =>
  new AppError(
    409,
    "This record changed. Export pending work, then load the current record before retrying.",
  );
export function audit(
  tx: Tx,
  actor: Actor,
  resourceType: string,
  resourceId: string,
  action: string,
  version: number,
  orderId?: string,
) {
  return tx.auditEvent.create({
    data: {
      actorId: actor.id,
      resourceType,
      resourceId,
      action,
      version,
      orderId,
    },
  });
}
export const productDto = <T extends { price: Prisma.Decimal }>(row: T) => ({
  ...row,
  price: row.price.toFixed(2),
});
export const orderDetails = {
  items: { orderBy: { productId: "asc" as const } },
  user: { select: { id: true, name: true, email: true } },
};
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderDetails }>;
export const orderDto = (row: OrderRow) => {
  const { requestHash, ...publicRow } = row;
  return {
    ...publicRow,
    total: row.total.toFixed(2),
    items: row.items.map((item) => ({ ...item, price: item.price.toFixed(2) })),
  };
};
