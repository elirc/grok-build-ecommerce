export type Role = "CUSTOMER" | "ADMIN";
export type User = { id: string; name: string; email: string; role: Role };
export type Session = { token: string; user: User };
export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: string;
  stock: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type ProductDraft = Pick<
  Product,
  "sku" | "name" | "description" | "category" | "price" | "active"
> & { stock: string };
export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";
export type Order = {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
  status: OrderStatus;
  total: string;
  currency: "USD";
  checkoutKey: string;
  version: number;
  createdAt: string;
  items: {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    price: string;
  }[];
};
export type Audit = {
  id: string;
  action: string;
  actorId: string;
  version: number;
  createdAt: string;
  orderId: string | null;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type CartLine = { product: Product; quantity: string };
export type CheckoutAttempt = {
  requestId: string;
  items: { productId: string; quantity: number }[];
};
export const cents = (price: string) => {
  const [whole, fraction = ""] = price.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
export const moneyFromCents = (value: number) =>
  "$" +
  Math.floor(value / 100).toLocaleString("en-US") +
  "." +
  String(value % 100).padStart(2, "0");
export const productDraft = (p: Product): ProductDraft => ({
  sku: p.sku,
  name: p.name,
  description: p.description,
  category: p.category,
  price: p.price,
  stock: String(p.stock),
  active: p.active,
});
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController(),
    external = options.signal,
    abort = () => controller.abort();
  external?.addEventListener("abort", abort, { once: true });
  if (external?.aborted) controller.abort();
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(
          "The request timed out and may already have completed. Refresh current records before retrying.",
        ),
      ),
    15000,
  );
  try {
    const response = await fetch("/api" + path, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "The service returned an unreadable response. Keep your draft and refresh before retrying.",
        response.status,
      );
    }
    if (!response.ok)
      throw new ApiError(
        data.error || "The request could not be completed.",
        response.status,
      );
    return data as T;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}
export function exportDraft(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
