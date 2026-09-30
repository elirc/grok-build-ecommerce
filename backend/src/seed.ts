import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma";
dotenv.config();
export async function seedDemo(password: string) {
  if (password.length < 12 || Buffer.byteLength(password) > 72)
    throw new Error(
      "DEMO_PASSWORD must contain 12 or more characters and at most 72 UTF-8 bytes.",
    );
  const userIds = ["demo_admin", "demo_customer", "demo_other"],
    productIds = ["prod_notebook", "prod_pen", "prod_mug", "prod_archived"],
    passwordHash = await bcrypt.hash(password, 10);
  return prisma.$transaction(async (tx) => {
    const users = await tx.user.count({ where: { id: { in: userIds } } }),
      products = await tx.product.count({ where: { id: { in: productIds } } });
    if (users === 3 && products === 4)
      return {
        created: 0,
        note: "Existing fictional identities, prices, stock and passwords preserved.",
      };
    if (users || products)
      throw new Error(
        "Partial demo identities exist. Inspect them before seeding; no rows changed.",
      );
    await tx.user.createMany({
      data: [
        {
          id: userIds[0],
          name: "Alex Catalogue",
          email: "admin@example.test",
          role: "ADMIN",
          passwordHash,
        },
        {
          id: userIds[1],
          name: "Sam Customer",
          email: "customer@example.test",
          role: "CUSTOMER",
          passwordHash,
        },
        {
          id: userIds[2],
          name: "Taylor Customer",
          email: "other@example.test",
          role: "CUSTOMER",
          passwordHash,
        },
      ],
    });
    await tx.product.createMany({
      data: [
        {
          id: productIds[0],
          sku: "NOTEBOOK-CREAM",
          name: "Everyday notebook",
          description:
            "A simple notebook for sketches, plans, and useful questions.",
          category: "Stationery",
          price: "12.50",
          stock: 20,
        },
        {
          id: productIds[1],
          sku: "PEN-BLUE",
          name: "Studio pen",
          description: "A blue ink pen for everyday notes.",
          category: "Stationery",
          price: "3.25",
          stock: 100,
        },
        {
          id: productIds[2],
          sku: "MUG-STONE",
          name: "Stoneware mug",
          description: "A quiet companion for your next study session.",
          category: "Desk essentials",
          price: "18.90",
          stock: 8,
        },
        {
          id: productIds[3],
          sku: "ARCHIVE-SAMPLE",
          name: "Archived sample",
          description: "Retained to demonstrate catalogue visibility.",
          category: "Examples",
          price: "5.00",
          stock: 0,
          active: false,
        },
      ],
    });
    await tx.auditEvent.createMany({
      data: productIds.map((id) => ({
        actorId: userIds[0],
        resourceType: "PRODUCT",
        resourceId: id,
        action: "SEED",
        version: 1,
      })),
    });
    return {
      created: 4,
      note: "Created fictional customers, an administrator and four catalogue products.",
    };
  });
}
if (require.main === module) {
  if (process.env.ALLOW_DEMO_SEED !== "yes")
    throw new Error(
      "Set ALLOW_DEMO_SEED=yes explicitly for fictional local data.",
    );
  seedDemo(process.env.DEMO_PASSWORD || "")
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
