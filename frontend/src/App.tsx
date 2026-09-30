import { FormEvent, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsPage } from "./features/products/pages/ProductsPage";
import { OrdersPage } from "./features/orders/pages/OrdersPage";
import { CartPanel } from "./features/cart/CartPanel";
import {
  CartLine,
  CheckoutAttempt,
  Product,
  Session,
  request,
} from "./api/client";
import { Guard } from "./hooks/useWorkspace";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const clean = { dirty: false, busy: false };
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [tab, setTab] = useState("catalogue"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [registering, setRegistering] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [error, setError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]),
    [attempt, setAttempt] = useState<CheckoutAttempt | null>(null),
    [lastOrder, setLastOrder] = useState("");
  const [productGuard, setProductGuard] = useState<Guard>(clean),
    [cartGuard, setCartGuard] = useState<Guard>(clean),
    [orderGuard, setOrderGuard] = useState<Guard>(clean);
  const busy = productGuard.busy || cartGuard.busy || orderGuard.busy,
    dirty = productGuard.dirty || cart.length > 0 || !!attempt;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setError("");
    try {
      const result = await request<Session>(
        registering ? "/auth/register" : "/auth/login",
        null,
        {
          method: "POST",
          body: JSON.stringify(
            registering ? { email, password, name } : { email, password },
          ),
        },
      );
      client.clear();
      setSession(result);
      setPassword("");
      setTab("catalogue");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }
  function add(product: Product) {
    if (attempt || busy) return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing)
        return current.map((line) =>
          line.product.id === product.id
            ? {
                ...line,
                product,
                quantity: String(
                  Math.min(999, (Number(line.quantity) || 0) + 1),
                ),
              }
            : line,
        );
      if (current.length >= 50) return current;
      return [...current, { product, quantity: "1" }];
    });
  }
  return (
    <QueryClientProvider client={client}>
      <main>
        <header className="hero">
          <p className="eyebrow">SMALL GOODS / COMMERCE WORKSPACE</p>
          <h1>Everyday essentials. Thoughtful details.</h1>
          <p>
            Browse the catalogue, build an order, and follow every accepted
            change.
          </p>
        </header>
        {!session ? (
          <section className="panel login-panel">
            <h2>
              {registering
                ? "Create a customer account"
                : "Sign in to the shop"}
            </h2>
            <p>
              Use a fictional local account. This workspace simulates orders and
              fulfillment without collecting payments.
            </p>
            <form onSubmit={login}>
              {registering && (
                <label>
                  Your name
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  minLength={registering ? 12 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p className="message error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={authBusy}>
                {authBusy
                  ? "Please wait..."
                  : registering
                    ? "Create customer account"
                    : "Sign in"}
              </button>
            </form>
            <button
              className="text-button"
              disabled={authBusy}
              onClick={() => {
                setRegistering(!registering);
                setPassword("");
                setError("");
              }}
            >
              {registering
                ? "Use an existing account"
                : "Create a local account"}
            </button>
            <p className="muted">
              Your token stays in this tab's memory. Refreshing signs you out.
            </p>
          </section>
        ) : (
          <>
            <div className="session-bar">
              <div>
                Signed in as <strong>{session.user.name}</strong>
                <span className="badge">{session.user.role}</span>
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    !dirty ||
                    confirm(
                      "Sign out and discard the cart and unsaved product changes? Export pending work first. If checkout is uncertain, review order history before starting a new attempt.",
                    )
                  ) {
                    client.clear();
                    setSession(null);
                    setCart([]);
                    setAttempt(null);
                    setLastOrder("");
                    setProductGuard(clean);
                    setCartGuard(clean);
                    setOrderGuard(clean);
                    setEmail("");
                    setError("");
                  }
                }}
              >
                Sign out
              </button>
            </div>
            <nav aria-label="Shop sections">
              <button
                className={tab === "catalogue" ? "primary" : ""}
                disabled={busy}
                onClick={() => setTab("catalogue")}
              >
                Catalogue and cart
              </button>
              <button
                className={tab === "orders" ? "primary" : ""}
                disabled={busy}
                onClick={() => setTab("orders")}
              >
                {session.user.role === "ADMIN" ? "All orders" : "My orders"}
              </button>
            </nav>
            <div hidden={tab !== "catalogue"}>
              <div className="shop-grid">
                <ProductsPage
                  session={session}
                  onAdd={add}
                  externalBusy={cartGuard.busy || orderGuard.busy}
                  cartLocked={!!attempt || busy}
                  cartFull={cart.length >= 50}
                  onGuardChange={setProductGuard}
                />
                <CartPanel
                  session={session}
                  cart={cart}
                  setCart={setCart}
                  attempt={attempt}
                  setAttempt={setAttempt}
                  disabled={productGuard.busy || orderGuard.busy}
                  onGuardChange={setCartGuard}
                  onAccepted={(order) => setLastOrder(order.id)}
                  onViewOrders={() => setTab("orders")}
                />
              </div>
            </div>
            <div hidden={tab !== "orders"}>
              <OrdersPage
                session={session}
                focusId={lastOrder}
                onGuardChange={setOrderGuard}
              />
            </div>
          </>
        )}
        <footer>
          Fictional local orders. USD examples exclude tax and shipping. No real
          payment is collected.
        </footer>
      </main>
    </QueryClientProvider>
  );
}
