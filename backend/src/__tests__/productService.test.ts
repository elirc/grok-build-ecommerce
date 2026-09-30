import {
  productInput,
  productUpdate,
  checkoutInput,
  transitionInput,
  productList,
  orderList,
  registrationInput,
  money,
} from "../lib/validation";
import { orderScope, requireAdmin, validateSecret } from "../middleware/auth";
import { fingerprint } from "../repositories/orderRepository";
const product = {
  sku: " book_1 ",
  name: " Notebook ",
  price: "12.5",
  stock: 3,
};
const key = "7fd6a6a6-d109-4c88-8d4e-6575ba29cc9a";
describe("commerce contracts and boundary values", () => {
  it("normalizes editable product values without changing the caller object", () => {
    expect(productInput.parse(product)).toMatchObject({
      sku: "BOOK_1",
      name: "Notebook",
      price: "12.50",
      active: true,
      description: "",
      category: "",
    });
    expect(product.sku).toBe(" book_1 ");
  });
  it("requires decimal price strings and never rounds excess precision", () => {
    for (const price of [
      12.5,
      "0",
      "-1",
      "01.25",
      "1e2",
      "1.001",
      "1000000",
      "NaN",
    ])
      expect(money.safeParse(price).success).toBe(false);
    expect(money.parse("0.1")).toBe("0.10");
    expect(money.parse("999999.99")).toBe("999999.99");
  });
  it("bounds stock to whole nonnegative quantities", () => {
    for (const stock of [-1, 1.5, "2", true, 1000001])
      expect(productInput.safeParse({ ...product, stock }).success).toBe(false);
  });
  it("rejects identity version and timestamp injection into editable products", () => {
    for (const field of ["id", "version", "createdAt", "orderItems"])
      expect(productInput.safeParse({ ...product, [field]: "x" }).success).toBe(
        false,
      );
  });
  it("bounds product text and SKU syntax", () => {
    for (const fields of [
      { sku: "?" },
      { sku: "X".repeat(41) },
      { name: " " },
      { name: "x".repeat(161) },
      { description: "x".repeat(2001) },
      { category: "x".repeat(81) },
    ])
      expect(productInput.safeParse({ ...product, ...fields }).success).toBe(
        false,
      );
  });
  it("requires a bounded integer captured version", () => {
    for (const version of [0, -1, "1", true, 1.1, 2147483647])
      expect(productUpdate.safeParse({ version, product }).success).toBe(false);
  });
  it("requires a UUID checkout key and a nonempty bounded cart", () => {
    for (const body of [
      { requestId: "bad", items: [{ productId: "p", quantity: 1 }] },
      { requestId: key, items: [] },
      {
        requestId: key,
        items: Array.from({ length: 51 }, (_, i) => ({
          productId: "p" + i,
          quantity: 1,
        })),
      },
    ])
      expect(checkoutInput.safeParse(body).success).toBe(false);
  });
  it("rejects repeated products and invalid quantities", () => {
    for (const quantity of [0, -1, 1.2, "1", true, 1000])
      expect(
        checkoutInput.safeParse({
          requestId: key,
          items: [{ productId: "p", quantity }],
        }).success,
      ).toBe(false);
    expect(
      checkoutInput.safeParse({
        requestId: key,
        items: [
          { productId: "p", quantity: 1 },
          { productId: "p", quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("does not accept client prices totals identities or status at checkout", () => {
    for (const extra of [
      { userId: "u" },
      { total: "0.01" },
      { status: "PAID" },
    ])
      expect(
        checkoutInput.safeParse({
          requestId: key,
          items: [{ productId: "p", quantity: 1 }],
          ...extra,
        }).success,
      ).toBe(false);
    expect(
      checkoutInput.safeParse({
        requestId: key,
        items: [{ productId: "p", quantity: 1, price: "0.01" }],
      }).success,
    ).toBe(false);
  });
  it("normalizes the fingerprint independently of cart ordering", () => {
    const items = [
      { productId: "b", quantity: 1 },
      { productId: "a", quantity: 2 },
    ];
    expect(fingerprint({ requestId: key, items })).toBe(
      fingerprint({ requestId: key, items: [...items].reverse() }),
    );
    expect(items[0].productId).toBe("b");
    expect(fingerprint({ requestId: key, items })).not.toBe(
      fingerprint({ requestId: key, items: [{ productId: "a", quantity: 3 }] }),
    );
  });
  it("rejects unsupported transitions and client-supplied payment fields", () => {
    for (const status of ["PENDING", "REFUNDED", "paid", null])
      expect(transitionInput.safeParse({ version: 1, status }).success).toBe(
        false,
      );
    expect(
      transitionInput.safeParse({ version: 1, status: "PAID", amount: "1.00" })
        .success,
    ).toBe(false);
  });
  it("rejects repeated queries ambiguous pages and unknown filters", () => {
    for (const q of [
      { page: "0" },
      { page: "01" },
      { page: "10001" },
      { q: ["a", "b"] },
      { other: "x" },
    ])
      expect(productList.safeParse(q).success).toBe(false);
    expect(orderList.safeParse({ status: "paid" }).success).toBe(false);
  });
  it("cannot turn missing identity into an unbounded admin order query", () => {
    expect(() =>
      orderScope({ id: undefined as never, role: "ADMIN" }),
    ).toThrow();
    expect(orderScope({ id: "u", role: "CUSTOMER" })).toEqual({ userId: "u" });
    expect(() => requireAdmin({ id: "u", role: "CUSTOMER" })).toThrow();
  });
  it("keeps registration role server-owned and enforces bcrypt byte limits", () => {
    const value = {
      email: " CUSTOMER@EXAMPLE.TEST ",
      name: "Sam",
      password: "synthetic-long-password",
    };
    expect(registrationInput.parse(value).email).toBe("customer@example.test");
    expect(
      registrationInput.safeParse({ ...value, role: "ADMIN" }).success,
    ).toBe(false);
    expect(
      registrationInput.safeParse({ ...value, password: "\u00e9".repeat(37) })
        .success,
    ).toBe(false);
  });
  it("requires a generated JWT secret instead of a fallback", () => {
    for (const value of ["", "dev-secret", "replace-" + "x".repeat(40)])
      expect(() => validateSecret(value)).toThrow();
  });
});
