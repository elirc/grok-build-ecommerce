import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createApp } from "../app";
import { issueToken } from "../middleware/auth";
import { seedDemo } from "../seed";
const secret = "synthetic-commerce-integration-secret-" + "x".repeat(40),
  password = "synthetic-only-password-2026";
let app: ReturnType<typeof createApp>,
  verified = false;
const call = (
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  user = "demo_customer",
) =>
  request(app)
    [method](path)
    .set("Authorization", "Bearer " + issueToken(user, secret));
const value = {
  sku: "TEST-SKU",
  name: "A test product",
  description: "A bounded example",
  category: "Learning",
  price: "12.50",
  stock: 10,
  active: true,
};
const checkout = (
  items = [{ productId: "prod_notebook", quantity: 2 }],
  requestId: string = randomUUID(),
  user = "demo_customer",
) => call("post", "/api/orders/checkout", user).send({ requestId, items });
async function makeProduct(extra = {}) {
  const result = await call("post", "/api/products", "demo_admin").send({
    ...value,
    ...extra,
  });
  expect(result.status).toBe(201);
  return result.body;
}
async function makeOrder() {
  const result = await checkout();
  expect(result.status).toBe(201);
  return result.body.order;
}
const transition = (
  id: string,
  status: string,
  version = 1,
  user = "demo_customer",
) => call("patch", `/api/orders/${id}/status`, user).send({ version, status });
async function auditFailure(work: () => Promise<void>) {
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic internal detail'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER reject_test_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`,
  );
  try {
    await work();
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_test_audit ON "AuditEvent"',
    );
    await prisma.$executeRawUnsafe("DROP FUNCTION reject_test_audit()");
  }
}
async function clear() {
  if (!verified) throw new Error("Fixture identity not verified");
  await prisma.auditEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
}
beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL || "http://missing");
  if (
    process.env.COMMERCE_TEST_DATABASE !== "owned-temporary-cluster" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/astra_commerce_test"
  )
    throw new Error("Run through the owned temporary database helper.");
  verified = true;
});
beforeEach(async () => {
  await clear();
  await seedDemo(password);
  app = createApp(secret);
});
afterAll(async () => {
  try {
    if (verified) await clear();
  } finally {
    await prisma.$disconnect();
  }
});
describe("authenticated catalogue and customer identity", () => {
  it("signs in with normalized email and returns no password hash", async () => {
    const r = await request(app)
      .post("/api/auth/login")
      .send({ email: " CUSTOMER@EXAMPLE.TEST ", password });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({
      id: "demo_customer",
      role: "CUSTOMER",
    });
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");
    expect(jwt.verify(r.body.token, secret)).toMatchObject({
      sub: "demo_customer",
    });
  });
  it("registers only a customer and rejects a concurrent duplicate email", async () => {
    const data = { email: "new@example.test", name: "New Customer", password };
    const results = await Promise.all(
      [1, 2].map(() => request(app).post("/api/auth/register").send(data)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 201)!.body.user.role).toBe(
      "CUSTOMER",
    );
    expect(await prisma.user.count({ where: { email: data.email } })).toBe(1);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({ ...data, email: "forged@example.test", role: "ADMIN" })
      ).status,
    ).toBe(400);
  });
  it("rolls registration back when its audit fails", async () => {
    await auditFailure(async () => {
      expect(
        (
          await request(app).post("/api/auth/register").send({
            email: "rollback@example.test",
            name: "Rollback",
            password,
          })
        ).status,
      ).toBe(500);
    });
    expect(await prisma.user.count()).toBe(3);
  });
  it("returns the same login rejection for unknown user and wrong password", async () => {
    for (const data of [
      { email: "missing@example.test", password },
      { email: "customer@example.test", password: "wrong" },
    ]) {
      const r = await request(app).post("/api/auth/login").send(data);
      expect(r.status).toBe(401);
      expect(r.body.error).toBe("Email or password was not accepted.");
    }
  });
  it("rejects missing tampered expired and wrong-audience bearer tokens", async () => {
    expect((await request(app).get("/api/products")).status).toBe(401);
    for (const token of [
      "fake",
      jwt.sign({ sub: "demo_admin" }, secret, { algorithm: "HS384" }),
      jwt.sign({ sub: "demo_admin" }, secret, {
        issuer: "commerce-workspace",
        audience: "wrong",
      }),
      jwt.sign({ sub: "demo_admin" }, secret, {
        issuer: "commerce-workspace",
        audience: "commerce-workspace-web",
        expiresIn: -1,
      }),
    ])
      expect(
        (
          await request(app)
            .get("/api/products")
            .set("Authorization", "Bearer " + token)
        ).status,
      ).toBe(401);
  });
  it("checks account activity and current role even for an existing token", async () => {
    await prisma.user.update({
      where: { id: "demo_admin" },
      data: { role: "CUSTOMER" },
    });
    expect(
      (await call("post", "/api/products", "demo_admin").send(value)).status,
    ).toBe(403);
    await prisma.user.update({
      where: { id: "demo_customer" },
      data: { active: false },
    });
    expect((await call("get", "/api/products")).status).toBe(401);
  });
  it("supports administrator product CRUD with strict saved versions", async () => {
    const p = await makeProduct();
    expect((await call("get", "/api/products/" + p.id)).body.price).toBe(
      "12.50",
    );
    const r = await call("put", "/api/products/" + p.id, "demo_admin").send({
      version: 1,
      product: { ...value, name: "Revised", price: "13.25" },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: p.id,
      name: "Revised",
      price: "13.25",
      version: 2,
    });
    expect(
      (
        await call("delete", "/api/products/" + p.id, "demo_admin").send({
          version: 2,
        })
      ).status,
    ).toBe(200);
    expect((await call("get", "/api/products/" + p.id)).status).toBe(404);
    expect(await prisma.auditEvent.count({ where: { resourceId: p.id } })).toBe(
      3,
    );
  });
  it("rejects customer product mutations and audit access", async () => {
    for (const method of ["post", "put", "delete"] as const)
      expect(
        (
          await call(
            method,
            "/api/products" + (method === "post" ? "" : "/prod_notebook"),
          ).send(method === "post" ? value : { version: 1, product: value })
        ).status,
      ).toBe(403);
    expect(
      (await call("get", "/api/products/prod_notebook/audit")).status,
    ).toBe(403);
  });
  it("rejects duplicate SKU blank fields and price or stock injection", async () => {
    expect(
      (
        await call("post", "/api/products", "demo_admin").send({
          ...value,
          sku: "notebook-cream",
        })
      ).status,
    ).toBe(409);
    for (const extra of [
      { id: "forged" },
      { stock: -1 },
      { price: 1.5 },
      { price: "1.001" },
      { name: " " },
    ])
      expect(
        (
          await call("post", "/api/products", "demo_admin").send({
            ...value,
            ...extra,
          })
        ).status,
      ).toBe(400);
  });
  it("hides archived products from customers while retaining admin review", async () => {
    expect((await call("get", "/api/products")).body.total).toBe(3);
    expect((await call("get", "/api/products/prod_archived")).status).toBe(404);
    expect((await call("get", "/api/products?active=false")).status).toBe(403);
    expect(
      (await call("get", "/api/products?active=false", "demo_admin")).body
        .total,
    ).toBe(1);
  });
  it("uses literal bounded catalogue search with stable pages", async () => {
    await prisma.product.createMany({
      data: Array.from({ length: 23 }, (_, n) => ({
        sku: "PAGING-" + n,
        name: n === 0 ? "Literal % underscore _" : "Page example " + n,
        price: "1.00",
        stock: 1,
      })),
    });
    const page1 = await call("get", "/api/products"),
      page2 = await call("get", "/api/products?page=2");
    expect(page1.body.items).toHaveLength(20);
    expect(page2.body.items).toHaveLength(6);
    expect(
      new Set([...page1.body.items, ...page2.body.items].map((x) => x.id)).size,
    ).toBe(26);
    expect((await call("get", "/api/products?q=%25")).body.total).toBe(1);
  });
  it("accepts one concurrent product edit and rejects stale deletion", async () => {
    const p = await makeProduct();
    const r = await Promise.all(
      ["A", "B"].map((name) =>
        call("put", "/api/products/" + p.id, "demo_admin").send({
          version: 1,
          product: { ...value, name },
        }),
      ),
    );
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(
      (
        await call("delete", "/api/products/" + p.id, "demo_admin").send({
          version: 1,
        })
      ).status,
    ).toBe(409);
  });
  it("rolls product writes back when their audit fails", async () => {
    const p = await makeProduct();
    await auditFailure(async () => {
      expect(
        (
          await call("post", "/api/products", "demo_admin").send({
            ...value,
            sku: "ROLLBACK",
          })
        ).status,
      ).toBe(500);
      expect(
        (
          await call("put", "/api/products/" + p.id, "demo_admin").send({
            version: 1,
            product: { ...value, stock: 500 },
          })
        ).status,
      ).toBe(500);
      expect(
        (
          await call("delete", "/api/products/" + p.id, "demo_admin").send({
            version: 1,
          })
        ).status,
      ).toBe(500);
    });
    expect((await call("get", "/api/products/" + p.id)).body).toMatchObject({
      stock: 10,
      version: 1,
    });
    expect(await prisma.product.count({ where: { sku: "ROLLBACK" } })).toBe(0);
  });
  it("enforces basic stock and money constraints for direct database writers", async () => {
    for (const data of [
      { stock: -1 },
      { stock: 1000001 },
      { price: "0.00" },
      { version: 0 },
    ])
      await expect(
        prisma.product.update({ where: { id: "prod_notebook" }, data }),
      ).rejects.toThrow();
  });
});
describe("atomic checkout and durable replay", () => {
  it("uses server prices and commits stock snapshots and audits together", async () => {
    const r = await checkout([
      { productId: "prod_notebook", quantity: 2 },
      { productId: "prod_pen", quantity: 3 },
    ]);
    expect(r.status).toBe(201);
    expect(r.headers.location).toBe("/api/orders/" + r.body.order.id);
    expect(r.body.order).toMatchObject({
      userId: "demo_customer",
      total: "34.75",
      currency: "USD",
      version: 1,
      status: "PENDING",
    });
    expect(r.body.order.requestHash).toBeUndefined();
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(18);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: "prod_pen" } }))
        .stock,
    ).toBe(97);
    expect(
      await prisma.auditEvent.count({ where: { orderId: r.body.order.id } }),
    ).toBe(3);
  });
  it("scopes order lists reads and audits to their owner or administrator", async () => {
    const o = await makeOrder();
    expect((await call("get", "/api/orders", "demo_other")).body.total).toBe(0);
    expect(
      (await call("get", "/api/orders/" + o.id, "demo_other")).status,
    ).toBe(404);
    expect(
      (await call("get", `/api/orders/${o.id}/audit`, "demo_other")).status,
    ).toBe(404);
    expect((await call("get", "/api/orders", "demo_admin")).body.total).toBe(1);
  });
  it("rejects client ownership total price and status claims before writing", async () => {
    for (const extra of [
      { userId: "demo_other" },
      { total: "0.01" },
      { status: "PAID" },
    ])
      expect(
        (
          await call("post", "/api/orders/checkout").send({
            requestId: randomUUID(),
            items: [{ productId: "prod_pen", quantity: 1 }],
            ...extra,
          })
        ).status,
      ).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });
  it("refuses archived missing or insufficient products without partial reservations", async () => {
    for (const productId of ["prod_archived", "missing", "prod_mug"]) {
      const r = await checkout([
        { productId: "prod_notebook", quantity: 2 },
        { productId, quantity: 99 },
      ]);
      expect(r.status).toBe(productId === "missing" ? 404 : 409);
      expect(
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: "prod_notebook" },
          })
        ).stock,
      ).toBe(20);
    }
    expect(await prisma.order.count()).toBe(0);
  });
  it("sells the last unit to exactly one of two customers", async () => {
    await prisma.product.update({
      where: { id: "prod_mug" },
      data: { stock: 1 },
    });
    const r = await Promise.all(
      ["demo_customer", "demo_other"].map((user) =>
        checkout([{ productId: "prod_mug", quantity: 1 }], randomUUID(), user),
      ),
    );
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: "prod_mug" } }))
        .stock,
    ).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });
  it("serializes simultaneous identical checkout keys into one order and reservation", async () => {
    const key = randomUUID(),
      items = [{ productId: "prod_notebook", quantity: 2 }];
    const results = await Promise.all([1, 2].map(() => checkout(items, key)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(18);
  });
  it("rejects a used key with different contents without reserving again", async () => {
    const key = randomUUID();
    expect((await checkout(undefined, key)).status).toBe(201);
    expect(
      (await checkout([{ productId: "prod_notebook", quantity: 3 }], key))
        .status,
    ).toBe(409);
    expect(await prisma.order.count()).toBe(1);
  });
  it("replays reordered identical carts using the historical price snapshots", async () => {
    const key = randomUUID(),
      items = [
        { productId: "prod_notebook", quantity: 1 },
        { productId: "prod_pen", quantity: 2 },
      ];
    const first = await checkout(items, key);
    await prisma.product.update({
      where: { id: "prod_pen" },
      data: { price: "99.00", name: "Renamed", sku: "RENAMED" },
    });
    const repeat = await checkout([...items].reverse(), key);
    expect(repeat.status).toBe(200);
    expect(repeat.body.order.id).toBe(first.body.order.id);
    expect(repeat.body.order.total).toBe("19.00");
    expect(
      repeat.body.order.items.find((x: any) => x.productId === "prod_pen"),
    ).toMatchObject({
      productName: "Studio pen",
      productSku: "PEN-BLUE",
      price: "3.25",
    });
  });
  it("scopes checkout keys to the customer identity", async () => {
    const key = randomUUID();
    expect((await checkout(undefined, key)).status).toBe(201);
    expect((await checkout(undefined, key, "demo_other")).status).toBe(201);
    expect(await prisma.order.count()).toBe(2);
  });
  it("replays a cancelled order without restoring it or reserving stock again", async () => {
    const key = randomUUID(),
      r = await checkout(undefined, key),
      id = r.body.order.id;
    expect((await transition(id, "CANCELLED")).status).toBe(200);
    const repeat = await checkout(undefined, key);
    expect(repeat.status).toBe(200);
    expect(repeat.body.order).toMatchObject({
      id,
      status: "CANCELLED",
      version: 2,
    });
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(20);
  });
  it("rolls back every checkout effect and key receipt when audit insertion fails", async () => {
    const key = randomUUID();
    await auditFailure(async () => {
      expect((await checkout(undefined, key)).status).toBe(500);
    });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(20);
    expect((await checkout(undefined, key)).status).toBe(201);
  });
  it("prevents a stale admin stock edit from overwriting a checkout reservation", async () => {
    await makeOrder();
    const original = await call(
      "get",
      "/api/products/prod_notebook",
      "demo_admin",
    );
    expect(original.body.version).toBe(2);
    const stale = await call(
      "put",
      "/api/products/prod_notebook",
      "demo_admin",
    ).send({
      version: 1,
      product: { ...value, sku: "NOTEBOOK-CREAM", stock: 50 },
    });
    expect(stale.status).toBe(409);
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(18);
  });
  it("protects purchased products from deletion and preserves archived order history", async () => {
    const o = await makeOrder(),
      p = (await call("get", "/api/products/prod_notebook", "demo_admin")).body;
    expect(
      (
        await call("delete", "/api/products/" + p.id, "demo_admin").send({
          version: p.version,
        })
      ).status,
    ).toBe(409);
    const { id, version, createdAt, updatedAt, ...input } = p;
    expect(
      (
        await call("put", "/api/products/" + id, "demo_admin").send({
          version,
          product: { ...input, active: false },
        })
      ).status,
    ).toBe(200);
    expect((await call("get", "/api/products/" + id)).status).toBe(404);
    expect(
      (await call("get", "/api/orders/" + o.id)).body.items[0].productName,
    ).toBe("Everyday notebook");
  });
});
describe("order lifecycle and bounded HTTP behavior", () => {
  it("restores stock and increments product and order versions on cancellation", async () => {
    const o = await makeOrder(),
      r = await transition(o.id, "CANCELLED");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "CANCELLED", version: 2 });
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: "prod_notebook" },
      }),
    ).toMatchObject({ stock: 20, version: 3 });
    expect(await prisma.auditEvent.count({ where: { orderId: o.id } })).toBe(4);
  });
  it("accepts one concurrent cancellation and restores inventory only once", async () => {
    const o = await makeOrder(),
      r = await Promise.all([1, 2].map(() => transition(o.id, "CANCELLED")));
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(20);
  });
  it("requires admin authority and exact sequential demo fulfillment states", async () => {
    const o = await makeOrder();
    expect((await transition(o.id, "PAID")).status).toBe(403);
    expect((await transition(o.id, "SHIPPED", 1, "demo_admin")).status).toBe(
      409,
    );
    for (const [status, version] of [
      ["PAID", 1],
      ["SHIPPED", 2],
      ["DELIVERED", 3],
    ] as const)
      expect(
        (await transition(o.id, status, version, "demo_admin")).status,
      ).toBe(200);
    expect((await transition(o.id, "CANCELLED", 4, "demo_admin")).status).toBe(
      409,
    );
    expect((await call("get", "/api/orders/" + o.id)).body.version).toBe(4);
  });
  it("refuses another customer's cancellation and stale administrative decisions", async () => {
    const o = await makeOrder();
    expect((await transition(o.id, "CANCELLED", 1, "demo_other")).status).toBe(
      404,
    );
    expect((await transition(o.id, "PAID", 1, "demo_admin")).status).toBe(200);
    expect((await transition(o.id, "SHIPPED", 1, "demo_admin")).status).toBe(
      409,
    );
    expect((await transition(o.id, "CANCELLED", 2)).status).toBe(409);
  });
  it("rolls cancellation and restored stock back when its audit fails", async () => {
    const o = await makeOrder();
    await auditFailure(async () => {
      expect((await transition(o.id, "CANCELLED")).status).toBe(500);
    });
    expect((await call("get", "/api/orders/" + o.id)).body).toMatchObject({
      status: "PENDING",
      version: 1,
    });
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: "prod_notebook" },
      }),
    ).toMatchObject({ stock: 18, version: 2 });
  });
  it("refuses cancellation that would overflow manually adjusted stock", async () => {
    const o = await makeOrder();
    await prisma.product.update({
      where: { id: "prod_notebook" },
      data: { stock: 1000000 },
    });
    expect((await transition(o.id, "CANCELLED")).status).toBe(409);
    expect((await call("get", "/api/orders/" + o.id)).body.status).toBe(
      "PENDING",
    );
  });
  it("allows only one winner between cancellation and demo payment", async () => {
    const o = await makeOrder(),
      r = await Promise.all([
        transition(o.id, "CANCELLED"),
        transition(o.id, "PAID", 1, "demo_admin"),
      ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    const current = (await call("get", "/api/orders/" + o.id)).body;
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: "prod_notebook" },
        })
      ).stock,
    ).toBe(current.status === "CANCELLED" ? 20 : 18);
  });
  it("rejects malformed repeated oversized and unapproved-origin requests", async () => {
    expect((await call("get", "/api/orders?page=1&page=2")).status).toBe(400);
    expect(
      (await call("post", "/api/orders/checkout?userId=other").send({})).status,
    ).toBe(400);
    expect(
      (
        await call("post", "/api/products", "demo_admin")
          .set("Content-Type", "application/json")
          .send('{"name":')
      ).status,
    ).toBe(400);
    expect(
      (
        await call("post", "/api/products", "demo_admin").send({
          ...value,
          description: "x".repeat(34000),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await call("get", "/api/products").set(
          "Origin",
          "https://unapproved.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call("get", "/api/products").set(
          "Origin",
          "http://127.0.0.1:5176",
        )
      ).status,
    ).toBe(200);
  });
  it("bounds authentication attempts within one process", async () => {
    for (let n = 0; n < 20; n++)
      expect(
        (
          await request(app)
            .post("/api/auth/login")
            .send({ email: "missing@example.test", password: "bad" })
        ).status,
      ).toBe(401);
    const r = await request(app)
      .post("/api/auth/login")
      .send({ email: "customer@example.test", password });
    expect(r.status).toBe(429);
    expect(r.headers["retry-after"]).toBe("900");
  });
  it("preserves existing demo prices stock passwords and names when reseeded", async () => {
    await prisma.product.update({
      where: { id: "prod_pen" },
      data: { stock: 9, price: "4.00" },
    });
    const u = await prisma.user.update({
      where: { id: "demo_customer" },
      data: { name: "Edited fixture" },
    });
    expect((await seedDemo("different-synthetic-password")).created).toBe(0);
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: "prod_pen" } }),
    ).toMatchObject({ stock: 9 });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
    ).toMatchObject({ name: "Edited fixture", passwordHash: u.passwordHash });
  });
});

describe("exact order totals", () => {
  it("sums decimal cents without binary floating-point drift", async () => {
    await prisma.product.update({
      where: { id: "prod_notebook" },
      data: { price: "0.10" },
    });
    await prisma.product.update({
      where: { id: "prod_pen" },
      data: { price: "0.20" },
    });
    const r = await checkout([
      { productId: "prod_notebook", quantity: 1 },
      { productId: "prod_pen", quantity: 1 },
    ]);
    expect(r.status).toBe(201);
    expect(r.body.order.total).toBe("0.30");
  });
  it("rejects an aggregate total outside its storage bound before reserving stock", async () => {
    const products = Array.from({ length: 11 }, (_, n) => ({
      id: "limit_" + n,
      sku: "LIMIT-" + n,
      name: "Bounded product",
      stock: 1000,
      price: "999999.99",
    }));
    await prisma.product.createMany({ data: products });
    const r = await checkout(
      products.map((p) => ({ productId: p.id, quantity: 999 })),
    );
    expect(r.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
    expect(
      (
        await prisma.product.findMany({
          where: { id: { in: products.map((p) => p.id) } },
        })
      ).every((p) => p.stock === 1000),
    ).toBe(true);
  });
});

describe("canonical checkout identity", () => {
  it("treats differently cased UUID spellings as the same concurrent receipt key", async () => {
    const key = "ABCDEF12-3456-4789-ABCD-EF1234567890";
    const results = await Promise.all([
      checkout(undefined, key),
      checkout(undefined, key.toLowerCase()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
  });
});
