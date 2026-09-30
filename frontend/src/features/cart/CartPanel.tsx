import { Dispatch, FormEvent, SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CartLine,
  CheckoutAttempt,
  Order,
  Session,
  cents,
  moneyFromCents,
  exportDraft,
  request,
} from "../../api/client";
import { Guard, useWorkspace } from "../../hooks/useWorkspace";
import { Feedback } from "../../components/Feedback";
export function CartPanel({
  session,
  cart,
  setCart,
  attempt,
  setAttempt,
  disabled,
  onGuardChange,
  onAccepted,
  onViewOrders,
}: {
  session: Session;
  cart: CartLine[];
  setCart: Dispatch<SetStateAction<CartLine[]>>;
  attempt: CheckoutAttempt | null;
  setAttempt: Dispatch<SetStateAction<CheckoutAttempt | null>>;
  disabled: boolean;
  onGuardChange: (value: Guard) => void;
  onAccepted: (order: Order) => void;
  onViewOrders: () => void;
}) {
  const work = useWorkspace(cart.length > 0 || !!attempt, onGuardChange),
    cache = useQueryClient(),
    locked = disabled || work.busy || !!attempt;
  const quantitiesValid = cart.every((line) =>
    /^[1-9]\d{0,2}$/.test(line.quantity),
  );
  const estimate = cart.reduce(
    (total, line) =>
      total + cents(line.product.price) * (Number(line.quantity) || 0),
    0,
  );
  function checkout(event: FormEvent) {
    event.preventDefault();
    if (disabled || work.busy || !cart.length || !quantitiesValid) return;
    const snapshot = attempt || {
      requestId: crypto.randomUUID(),
      items: cart.map((line) => ({
        productId: line.product.id,
        quantity: Number(line.quantity),
      })),
    };
    if (
      !attempt &&
      !confirm(
        "Create this demo order and reserve available stock? Current server prices determine its total. No payment is collected.",
      )
    )
      return;
    setAttempt(snapshot);
    void work.run(async () => {
      const result = await request<{ order: Order; replayed: boolean }>(
        "/orders/checkout",
        session.token,
        { method: "POST", body: JSON.stringify(snapshot) },
      );
      if (work.alive.current) {
        setCart([]);
        setAttempt(null);
        onAccepted(result.order);
        work.setNotice(
          (result.replayed ? "Recovered existing order " : "Order created: ") +
            result.order.id +
            " - " +
            moneyFromCents(cents(result.order.total)) +
            " - " +
            result.order.status.toLowerCase() +
            ".",
        );
        await cache.invalidateQueries({ queryKey: [session.user.id] });
      }
    });
  }
  return (
    <aside className="panel cart-panel" aria-label="Shopping cart">
      <p className="eyebrow">YOUR SELECTION</p>
      <h2>Shopping cart</h2>
      <p>
        Quantities stay in this tab while you browse. Checkout reserves stock;
        payment is a separate simulated step.
      </p>
      <Feedback error={work.error} notice={work.notice} />
      {!cart.length ? (
        <p>Your cart is empty. Add a product to begin.</p>
      ) : (
        <form onSubmit={checkout}>
          <ul className="cart-lines">
            {cart.map((line) => (
              <li key={line.product.id}>
                <strong>{line.product.name}</strong>
                <p className="muted">
                  {moneyFromCents(cents(line.product.price))} each /{" "}
                  {line.product.sku}
                </p>
                <label>
                  Quantity for {line.product.name}
                  <input
                    aria-label={"Quantity for " + line.product.name}
                    type="number"
                    min="1"
                    max="999"
                    step="1"
                    required
                    disabled={locked}
                    value={line.quantity}
                    onChange={(e) =>
                      setCart((current) =>
                        current.map((row) =>
                          row.product.id === line.product.id
                            ? { ...row, quantity: e.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    setCart((current) =>
                      current.filter(
                        (row) => row.product.id !== line.product.id,
                      ),
                    )
                  }
                >
                  Remove {line.product.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="cart-total">
            Estimated total{" "}
            <strong>
              {quantitiesValid
                ? moneyFromCents(estimate)
                : "Complete quantities"}
            </strong>
          </p>
          <p className="muted">
            The accepted order uses current server prices. Tax and shipping are
            outside this demo.
          </p>
          {attempt && (
            <div className="attempt-note">
              <strong>A checkout attempt is saved.</strong>
              <p>
                Retry uses the same items and key, so a completed order is
                recovered instead of duplicated.
              </p>
              <code>{attempt.requestId}</code>
              <button
                type="button"
                disabled={disabled || work.busy}
                onClick={() => {
                  if (
                    confirm(
                      "Check order history first. Starting a new attempt after an uncertain completion can create another order. Unlock this cart with a new checkout key?",
                    )
                  ) {
                    setAttempt(null);
                    work.setError("");
                    work.setNotice(
                      "Cart unlocked. Review quantities and current product prices before checkout.",
                    );
                  }
                }}
              >
                Unlock cart for a new attempt
              </button>
            </div>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={disabled || work.busy || !quantitiesValid}
            >
              {work.busy
                ? "Checking order..."
                : attempt
                  ? "Retry saved checkout"
                  : "Place demo order"}
            </button>
            <button
              type="button"
              onClick={() =>
                exportDraft("cart-draft.json", {
                  userId: session.user.id,
                  cart,
                  attempt,
                })
              }
            >
              Export cart draft
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                if (confirm("Clear all unsaved cart items?")) setCart([]);
              }}
            >
              Clear cart
            </button>
          </div>
        </form>
      )}
      <button
        type="button"
        disabled={disabled || work.busy}
        onClick={onViewOrders}
      >
        Review order history
      </button>
    </aside>
  );
}
