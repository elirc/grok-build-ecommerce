import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ProductsPage } from "../features/products/pages/ProductsPage";
import { request, cents, moneyFromCents, Role } from "../api/client";
const product = {
  id: "p",
  sku: "NOTEBOOK",
  name: "Notebook",
  description: "Useful pages",
  category: "Stationery",
  price: "12.50",
  stock: 3,
  active: true,
  version: 1,
  createdAt: "2030-01-01",
  updatedAt: "2030-01-01",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());
function mount(role: Role = "CUSTOMER") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductsPage
        session={{
          token: "synthetic",
          user: { id: "u", name: "Sam", email: "sam@example.test", role },
        }}
        onAdd={() => {}}
        externalBusy={false}
        cartLocked={false}
        cartFull={false}
        onGuardChange={() => {}}
      />
    </QueryClientProvider>,
  );
}
describe("commerce browser boundaries", () => {
  it("sends only the authenticated token and JSON content type required by checkout", async () => {
    const mock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal("fetch", mock);
    await request("/orders/checkout", "synthetic", {
      method: "POST",
      body: JSON.stringify({ requestId: "key", items: [] }),
    });
    expect(mock.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer synthetic",
      "Content-Type": "application/json",
    });
    expect(mock.mock.calls[0][0]).toBe("/api/orders/checkout");
  });
  it("rejects failed HTTP responses instead of treating them as accepted orders", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: "Insufficient stock" }, 409)),
    );
    await expect(request("/orders/checkout", "t")).rejects.toThrow(
      "Insufficient stock",
    );
  });
  it("rejects an unreadable successful response without inventing an order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>wrong</html>")),
    );
    await expect(request("/orders/checkout", "t")).rejects.toThrow(
      "unreadable",
    );
  });
  it("forwards query cancellation to fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, options) => {
        expect(options.signal.aborted).toBe(true);
        throw new DOMException("Aborted", "AbortError");
      }),
    );
    await expect(
      request("/products", "t", { signal: controller.signal }),
    ).rejects.toThrow("Aborted");
  });
  it("renders customer catalogue actions without administrator mutation controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ items: [product], total: 1, page: 1, pageSize: 20 }),
        ),
    );
    mount();
    expect(
      await screen.findByRole("button", { name: "Add Notebook to cart" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New product" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Notebook" }),
    ).not.toBeInTheDocument();
  });
  it("opens a real administrator product draft from an empty catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ items: [], total: 0, page: 1, pageSize: 20 }),
        ),
    );
    mount("ADMIN");
    expect(
      await screen.findByText("No products match this search."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "New product" }));
    expect(screen.getByLabelText("SKU")).toBeVisible();
    expect(screen.getByText("Unsaved product changes")).toBeVisible();
  });
  it("distinguishes a catalogue query failure from an empty catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ error: "Database unavailable" }, 503)),
    );
    mount();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Database unavailable",
      ),
    );
    expect(
      screen.queryByText("No products match this search."),
    ).not.toBeInTheDocument();
  });
  it("formats estimates using integer cents rather than floating-point rounding", () => {
    expect(cents("0.10") + cents("0.20")).toBe(30);
    expect(moneyFromCents(cents("12.50") * 2 + cents("3.25") * 3)).toBe(
      "$34.75",
    );
    expect(moneyFromCents(30)).toBe("$0.30");
  });
});
