import { test, expect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
const api = "http://127.0.0.1:" + process.env.API_PORT,
  password = process.env.DEMO_PASSWORD;
const headers = (user = "demo_admin") => ({
  Authorization:
    "Bearer " +
    jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: user,
      issuer: "commerce-workspace",
      audience: "commerce-workspace-web",
      expiresIn: "30m",
    }),
});
const value = {
  sku: "BROWSER-ITEM",
  name: "Browser item",
  description: "A useful CRUD example",
  category: "Learning",
  price: "10.25",
  stock: 10,
  active: true,
};
async function product(request, name, extra = {}) {
  const response = await request.post(api + "/api/products", {
    headers: headers(),
    data: {
      ...value,
      sku: randomUUID().slice(0, 12).toUpperCase(),
      name,
      ...extra,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function order(
  request,
  user = "demo_customer",
  items = [{ productId: "prod_pen", quantity: 1 }],
) {
  const response = await request.post(api + "/api/orders/checkout", {
    headers: headers(user),
    data: { requestId: randomUUID(), items },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).order;
}
async function login(page, email = "customer@example.test") {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Catalogue and cart", exact: true }),
  ).toBeVisible();
}
async function editProduct(page, name) {
  await page.getByLabel("Search products", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    name,
  );
}
async function openOrder(page, row, admin = false) {
  await page
    .getByRole("button", {
      name: admin ? "All orders" : "My orders",
      exact: true,
    })
    .click();
  await page.getByLabel("Search orders", { exact: true }).fill(row.id);
  await page
    .getByRole("button", { name: "Review order " + row.id, exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Order details", exact: true })
      .getByText(row.id, { exact: true }),
  ).toBeVisible();
}
const accepted = (page, text) =>
  expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
async function add(page, name) {
  await page.getByLabel("Search products", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Add " + name + " to cart", exact: true })
    .click();
}

test("customer scope is reflected in the UI and tokens stay only in tab memory", async ({
  page,
  request,
}) => {
  const other = await order(request, "demo_other");
  await login(page);
  await expect(
    page.getByRole("button", { name: "New product", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My orders", exact: true }).click();
  await page.getByLabel("Search orders", { exact: true }).fill(other.id);
  await expect(page.getByText("No orders match this search.")).toBeVisible();
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("local registration creates a customer who can browse without admin controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a local account", exact: true })
    .click();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("New Browser Customer");
  await page
    .getByLabel("Email", { exact: true })
    .fill("browser-customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-new-customer-password");
  await page
    .getByRole("button", { name: "Create customer account", exact: true })
    .click();
  await expect(
    page.getByText("New Browser Customer", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Add Everyday notebook to cart",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New product", exact: true }),
  ).toHaveCount(0);
});
test("administrator product CRUD keeps accepted identity and confirms deletion", async ({
  page,
  request,
}) => {
  await login(page, "admin@example.test");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  await page.getByLabel("SKU", { exact: true }).fill("BROWSER-CRUD");
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Browser CRUD product");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Explain the inventory boundary.");
  await page.getByLabel("Price in USD", { exact: true }).fill("14.25");
  await page.getByLabel("Available stock", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await accepted(page, "Product saved at version 1");
  await page.getByLabel("Available stock", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await accepted(page, "Product saved at version 2");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Browser CRUD product",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  await accepted(page, "Product deleted.");
  expect(
    (
      await (
        await request.get(api + "/api/products?q=BROWSER-CRUD", {
          headers: headers(),
        })
      ).json()
    ).total,
  ).toBe(0);
});
test("two product editors retain the stale draft and its captured version", async ({
  page,
  context,
  request,
}) => {
  const row = await product(request, "Product conflict browser");
  await login(page, "admin@example.test");
  await editProduct(page, row.name);
  const second = await context.newPage();
  await login(second, "admin@example.test");
  await editProduct(second, row.name);
  await page.getByLabel("Available stock", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await accepted(page, "Product saved at version 2");
  await second.getByLabel("Available stock", { exact: true }).fill("19");
  await second
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await expect(second.getByRole("alert")).toContainText("record changed");
  await expect(
    second.getByLabel("Available stock", { exact: true }),
  ).toHaveValue("19");
  const download = second.waitForEvent("download");
  await second
    .getByRole("button", { name: "Export product draft", exact: true })
    .click();
  const draft = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  expect(draft.version).toBe(1);
  expect(draft.product.stock).toBe("19");
  second.once("dialog", (d) => d.accept());
  await second
    .getByRole("button", { name: "Load current product", exact: true })
    .click();
  await expect(
    second.getByLabel("Available stock", { exact: true }),
  ).toHaveValue("7");
});
test("cart quantity editing produces an accepted server-calculated order", async ({
  page,
}) => {
  await login(page);
  await add(page, "Everyday notebook");
  await page
    .getByLabel("Quantity for Everyday notebook", { exact: true })
    .fill("2");
  await add(page, "Studio pen");
  await page.getByLabel("Quantity for Studio pen", { exact: true }).fill("3");
  await expect(
    page
      .getByRole("complementary", { name: "Shopping cart", exact: true })
      .getByText("$34.75", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Place demo order", exact: true })
    .click();
  await expect(
    page.getByLabel("Quantity for Everyday notebook", { exact: true }),
  ).toHaveValue("2");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Place demo order", exact: true })
    .click();
  await accepted(page, "Order created:");
  await expect(
    page.getByText("Your cart is empty. Add a product to begin."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review order history", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Order details", exact: true })
      .getByText("$34.75", { exact: true }),
  ).toBeVisible();
});
test("a lost checkout response can retry the same key without another order", async ({
  page,
  request,
}) => {
  const row = await product(request, "Retry receipt item", { stock: 5 });
  await login(page);
  await add(page, row.name);
  let acceptedOrder,
    firstBody,
    secondBody,
    intercepted = 0;
  await page.route("**/api/orders/checkout", async (route) => {
    intercepted++;
    if (intercepted === 1) {
      firstBody = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      acceptedOrder = (await response.json()).order;
      await route.abort("failed");
    } else {
      secondBody = route.request().postDataJSON();
      await route.continue();
    }
  });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Place demo order", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByLabel("Quantity for " + row.name, { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry saved checkout", exact: true })
    .click();
  await accepted(page, "Recovered existing order " + acceptedOrder.id);
  expect(secondBody).toEqual(firstBody);
  const current = await (
    await request.get(api + "/api/products/" + row.id, { headers: headers() })
  ).json();
  expect(current.stock).toBe(4);
  const history = await (
    await request.get(api + "/api/orders?q=Retry%20receipt%20item", {
      headers: headers("demo_customer"),
    })
  ).json();
  expect(history.total).toBe(1);
});
test("rejected checkout preserves an exportable frozen attempt before explicit cart changes", async ({
  page,
}) => {
  await login(page);
  await add(page, "Stoneware mug");
  await page
    .getByLabel("Quantity for Stoneware mug", { exact: true })
    .fill("999");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Place demo order", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Insufficient stock");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export cart draft", exact: true })
    .click();
  const draft = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  expect(draft.attempt.items[0].quantity).toBe(999);
  expect(draft.attempt.requestId).toMatch(/^[a-f0-9-]{36}$/);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Unlock cart for a new attempt", exact: true })
    .click();
  await page
    .getByLabel("Quantity for Stoneware mug", { exact: true })
    .fill("1");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Place demo order", exact: true })
    .click();
  await accepted(page, "Order created:");
});
test("the owner cancels a pending order and sees retained history", async ({
  page,
  request,
}) => {
  const row = await order(request);
  await login(page);
  await openOrder(page, row);
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Cancel pending order", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel pending order", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Cancel pending order", exact: true })
    .click();
  await accepted(page, "Order updated: cancelled at version 2");
  await expect(
    page.getByRole("button", { name: "Cancel pending order", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await (
        await request.get(api + "/api/orders/" + row.id, {
          headers: headers("demo_customer"),
        })
      ).json()
    ).status,
  ).toBe("CANCELLED");
});
test("administrators advance only the explicit simulated fulfillment steps", async ({
  page,
  request,
}) => {
  const row = await order(request);
  await login(page, "admin@example.test");
  await openOrder(page, row, true);
  for (const [label, status, version] of [
    ["Record demo payment", "paid", 2],
    ["Mark shipped", "shipped", 3],
    ["Mark delivered", "delivered", 4],
  ]) {
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: label, exact: true }).click();
    await accepted(page, `Order updated: ${status} at version ${version}`);
  }
  await expect(
    page.getByRole("combobox", { name: "Next order action", exact: true }),
  ).toHaveCount(0);
});
test("a stale cancellation cannot replace an accepted demo-payment decision", async ({
  page,
  context,
  request,
}) => {
  const row = await order(request);
  await login(page);
  await openOrder(page, row);
  const admin = await context.newPage();
  await login(admin, "admin@example.test");
  await openOrder(admin, row, true);
  admin.once("dialog", (d) => d.accept());
  await admin
    .getByRole("button", { name: "Record demo payment", exact: true })
    .click();
  await accepted(admin, "Order updated: paid at version 2");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Cancel pending order", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("record changed");
  await page
    .getByRole("button", { name: "Load current order", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Order details", exact: true })
      .getByText("paid", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel pending order", exact: true }),
  ).toHaveCount(0);
});
test("product save acceptance survives a later catalogue refresh failure", async ({
  page,
  request,
}) => {
  const row = await product(request, "Refresh failure product");
  await login(page, "admin@example.test");
  await editProduct(page, row.name);
  await page.route("**/api/products?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic catalogue refresh failure" }),
    }),
  );
  await page.getByLabel("Available stock", { exact: true }).fill("22");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await accepted(page, "Product saved at version 2");
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic catalogue refresh failure",
  );
  await expect(page.getByLabel("Available stock", { exact: true })).toHaveValue(
    "22",
  );
});
test("section navigation preserves cart and product drafts while sign-out confirms discard", async ({
  page,
  request,
}) => {
  const row = await product(request, "Navigation draft product");
  await login(page, "admin@example.test");
  await editProduct(page, row.name);
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Keep this pending name");
  await add(page, row.name);
  await page.getByRole("button", { name: "All orders", exact: true }).click();
  await page
    .getByRole("button", { name: "Catalogue and cart", exact: true })
    .click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Keep this pending name",
  );
  await expect(
    page.getByLabel("Quantity for " + row.name, { exact: true }),
  ).toHaveValue("1");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Keep this pending name",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("literal product content renders as text without executing markup", async ({
  page,
  request,
}) => {
  const name = '<img src=x onerror="window.injected=1">';
  await product(request, name);
  await login(page);
  await page.getByLabel("Search products", { exact: true }).fill(name);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
test("desktop and narrow catalogue cart and order receipts remain readable", async ({
  page,
  request,
}) => {
  await login(page);
  await add(page, "Stoneware mug");
  await page
    .getByLabel("Quantity for Stoneware mug", { exact: true })
    .fill("2");
  mkdirSync("astraupskill/images", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["narrow", 390, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `astraupskill/images/${name}.png`,
      fullPage: true,
    });
  }
  const row = await order(request, "demo_customer", [
    { productId: "prod_notebook", quantity: 1 },
    { productId: "prod_pen", quantity: 2 },
  ]);
  await openOrder(page, row);
  await expect(page.getByRole("table")).toBeVisible();
  for (const [name, width, height] of [
    ["receipt-desktop", 1440, 1100],
    ["receipt-narrow", 390, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `astraupskill/images/${name}.png`,
      fullPage: true,
    });
  }
});
