import { z } from "zod";
const text = (max: number, empty = false) =>
  z
    .string()
    .trim()
    .min(empty ? 0 : 1)
    .max(max)
    .refine(
      (value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value),
      "Unsupported control characters",
    );
export const identity = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/, "Invalid identity");
export const version = z.number().int().min(1).max(2147483646);
export const money = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,5})(\.\d{1,2})?$/,
    "Use a decimal price up to 999999.99 with at most two fractional digits",
  )
  .refine((value) => Number(value) > 0, "Price must be positive")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return whole + "." + fraction.padEnd(2, "0");
  });
export const productInput = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
    name: text(160),
    description: text(2000, true).default(""),
    category: text(80, true).default(""),
    price: money,
    stock: z.number().int().min(0).max(1000000),
    active: z.boolean().default(true),
  })
  .strict();
export const productUpdate = z
  .object({ version, product: productInput })
  .strict();
export const deleteInput = z.object({ version }).strict();
export const listInput = z
  .object({
    q: text(120, true).default(""),
    page: z
      .string()
      .regex(/^[1-9]\d{0,4}$/)
      .transform(Number)
      .refine((value) => value <= 10000)
      .default("1"),
  })
  .strict();
export const productList = listInput
  .extend({ active: z.enum(["true", "false", ""]).default("true") })
  .strict();
export const orderList = listInput
  .extend({
    status: z
      .enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", ""])
      .default(""),
  })
  .strict();
export const checkoutInput = z
  .object({
    requestId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    items: z
      .array(
        z
          .object({
            productId: identity,
            quantity: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.productId)).size ===
      value.items.length,
    "Each product may appear only once",
  );
export const transitionInput = z
  .object({
    version,
    status: z.enum(["PAID", "SHIPPED", "DELIVERED", "CANCELLED"]),
  })
  .strict();
export const loginInput = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z
      .string()
      .min(1)
      .refine(
        (value) => Buffer.byteLength(value, "utf8") <= 72,
        "Password exceeds 72 UTF-8 bytes",
      ),
  })
  .strict();
export const registrationInput = loginInput
  .extend({
    name: text(120),
    password: loginInput.shape.password.refine(
      (value) => value.length >= 12,
      "Use at least 12 characters",
    ),
  })
  .strict();
export type ProductInput = z.infer<typeof productInput>;
export type ProductList = z.infer<typeof productList>;
export type OrderList = z.infer<typeof orderList>;
export type CheckoutInput = z.infer<typeof checkoutInput>;
export type TransitionInput = z.infer<typeof transitionInput>;
