import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Audit,
  Order,
  OrderStatus,
  Page,
  Session,
  cents,
  moneyFromCents,
  request,
} from "../../../api/client";
import { Guard, useDebounced, useWorkspace } from "../../../hooks/useWorkspace";
import { Feedback, Pagination, QueryError } from "../../../components/Feedback";
const transitions = (row: Order, admin: boolean): OrderStatus[] =>
  row.status === "PENDING"
    ? admin
      ? ["PAID", "CANCELLED"]
      : ["CANCELLED"]
    : admin && row.status === "PAID"
      ? ["SHIPPED"]
      : admin && row.status === "SHIPPED"
        ? ["DELIVERED"]
        : [];
const labels: Record<string, string> = {
  PAID: "Record demo payment",
  SHIPPED: "Mark shipped",
  DELIVERED: "Mark delivered",
  CANCELLED: "Cancel pending order",
};
export function OrdersPage({
  session,
  focusId,
  onGuardChange,
}: {
  session: Session;
  focusId: string;
  onGuardChange: (guard: Guard) => void;
}) {
  const admin = session.user.role === "ADMIN",
    cache = useQueryClient(),
    work = useWorkspace(false, onGuardChange),
    [search, setSearch] = useState(""),
    query = useDebounced(search),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Order | null>(null),
    [target, setTarget] = useState<OrderStatus | "">("");
  const orders = useQuery({
    queryKey: [session.user.id, "orders", query, status, page],
    queryFn: ({ signal }) =>
      request<Page<Order>>(
        "/orders?" +
          new URLSearchParams({ q: query, status, page: String(page) }),
        session.token,
        { signal },
      ),
  });
  const audit = useQuery({
    queryKey: [session.user.id, "order-audit", selected?.id],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      request<{ items: Audit[] }>(
        `/orders/${selected!.id}/audit`,
        session.token,
        { signal },
      ),
  });
  function adopt(row: Order) {
    setSelected(row);
    setTarget(transitions(row, admin)[0] || "");
  }
  useEffect(() => setPage(1), [query, status]);
  useEffect(() => {
    if (orders.data && page > Math.max(1, Math.ceil(orders.data.total / 20)))
      setPage(Math.max(1, Math.ceil(orders.data.total / 20)));
  }, [orders.data, page]);
  useEffect(() => {
    if (!focusId) return;
    const controller = new AbortController();
    void request<Order>("/orders/" + focusId, session.token, {
      signal: controller.signal,
    })
      .then((row) => {
        if (!controller.signal.aborted) adopt(row);
      })
      .catch((error) => {
        if (!controller.signal.aborted) work.setError(error.message);
      });
    return () => controller.abort();
  }, [focusId, session.token]);
  function choose(id: string) {
    void work.run(async () => {
      const row = await request<Order>("/orders/" + id, session.token);
      if (work.alive.current) adopt(row);
    });
  }
  function advance() {
    if (!selected || !target) return;
    const baseline = selected,
      status = target;
    if (
      !confirm(
        status === "CANCELLED"
          ? "Cancel this pending order and restore its reserved stock?"
          : "Apply this simulated fulfillment step? No payment or shipment is performed by this action.",
      )
    )
      return;
    void work.run(async () => {
      const row = await request<Order>(
        `/orders/${baseline.id}/status`,
        session.token,
        {
          method: "PATCH",
          body: JSON.stringify({ version: baseline.version, status }),
        },
      );
      if (work.alive.current) {
        adopt(row);
        work.setNotice(
          "Order updated: " +
            row.status.toLowerCase() +
            " at version " +
            row.version +
            ".",
        );
        await cache.invalidateQueries({ queryKey: [session.user.id] });
      }
    });
  }
  return (
    <section aria-label="Order workspace">
      <div className="section-title">
        <div>
          <p className="eyebrow">ACCEPTED ORDERS</p>
          <h2>{admin ? "All customer orders" : "Your order history"}</h2>
        </div>
        <button
          disabled={orders.isFetching}
          onClick={() => void orders.refetch()}
        >
          Refresh orders
        </button>
      </div>
      <p>
        Orders retain their accepted item names, SKUs, and prices. Pending
        orders may be cancelled; later states represent simulated fulfillment.
      </p>
      <Feedback error={work.error} notice={work.notice} />
      <div className="orders-grid">
        <section className="panel" aria-label="Order library">
          <label>
            Search orders
            <input
              type="search"
              maxLength={120}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order ID or purchased product"
            />
          </label>
          <label>
            Order status filter
            <select
              aria-label="Order status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
                  </option>
                ),
              )}
            </select>
          </label>
          {orders.isPending && <p role="status">Loading orders...</p>}
          <QueryError error={orders.error} hasData={!!orders.data} />
          {orders.data && (
            <>
              <p>
                {orders.data.total}{" "}
                {orders.data.total === 1 ? "order" : "orders"} in this view
              </p>
              <div className="order-cards">
                {orders.data.items.map((row) => (
                  <article className="record" key={row.id}>
                    <span className="badge">{row.status.toLowerCase()}</span>
                    <h3>{moneyFromCents(cents(row.total))}</h3>
                    <p>
                      {row.items.map((item) => item.productName).join(", ")}
                    </p>
                    {admin && <p>{row.user.name}</p>}
                    <code>{row.id}</code>
                    <button disabled={work.busy} onClick={() => choose(row.id)}>
                      Review order {row.id}
                    </button>
                  </article>
                ))}
              </div>
              {!orders.data.items.length && <p>No orders match this search.</p>}
              <Pagination
                page={page}
                total={orders.data.total}
                busy={orders.isFetching}
                label="orders"
                onChange={setPage}
              />
            </>
          )}
        </section>
        <section className="panel order-detail" aria-label="Order details">
          {!selected ? (
            <>
              <h3>Choose an order to review</h3>
              <p>
                Inspect its accepted prices, current status, and recorded
                changes.
              </p>
            </>
          ) : (
            <>
              <div className="section-title">
                <h3>Order details</h3>
                <span className="badge">Version {selected.version}</span>
              </div>
              <code>{selected.id}</code>
              <p>
                <strong>{selected.status.toLowerCase()}</strong> /{" "}
                {selected.user.name}
              </p>
              <p>Created {new Date(selected.createdAt).toLocaleString()}</p>
              <div className="table-scroll">
                <table>
                  <caption>Purchased items</caption>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.productName}
                          <small>{item.productSku}</small>
                        </td>
                        <td>{item.quantity}</td>
                        <td>{moneyFromCents(cents(item.price))}</td>
                        <td>
                          {moneyFromCents(cents(item.price) * item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cart-total">
                Accepted total{" "}
                <strong>{moneyFromCents(cents(selected.total))}</strong>
              </p>
              <p className="muted">Checkout key</p>
              <code>{selected.checkoutKey}</code>
              {transitions(selected, admin).length > 0 && (
                <div className="order-action">
                  <label>
                    Next order action
                    <select
                      aria-label="Next order action"
                      disabled={work.busy}
                      value={target}
                      onChange={(e) => setTarget(e.target.value as OrderStatus)}
                    >
                      {transitions(selected, admin).map((value) => (
                        <option key={value} value={value}>
                          {labels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={target === "CANCELLED" ? "danger" : "primary"}
                    disabled={work.busy || !target}
                    onClick={advance}
                  >
                    {labels[target] || "Apply order action"}
                  </button>
                </div>
              )}
              <button disabled={work.busy} onClick={() => choose(selected.id)}>
                Load current order
              </button>
              <h4>Recent order changes</h4>
              <QueryError error={audit.error} />
              {audit.data && (
                <ol>
                  {audit.data.items.map((row) => (
                    <li key={row.id}>
                      {row.action.toLowerCase()} - version {row.version}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
