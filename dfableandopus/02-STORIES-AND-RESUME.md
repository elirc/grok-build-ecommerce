# Stories, resume lines and the spoken summary

## STAR story 1: the checkout that could sell the same unit twice

**Situation.** The starter checkout took the customer id out of the request body, wrote zero into every line price and into the order total, and never touched `Product.stock`. A customer whose response was dropped by a flaky connection had no safe way to retry: pressing the button again created a second order.

**Task.** Make a checkout that is safe to retry, without asking the browser to hold anything more than a key it already generates.

**Action.** I made the cart the only thing the client sends. `checkoutInput` in `backend/src/lib/validation.ts:67-91` accepts a UUID `requestId` and one to fifty `{ productId, quantity }` pairs, is `.strict()`, and refuses a repeated product. Identity comes from the token. Inside one transaction, `backend/src/repositories/orderRepository.ts:93` takes `pg_advisory_xact_lock` over `userId + ":" + requestId` before line 94 looks for a durable receipt on the `(userId, checkoutKey)` unique index. Each product is locked with `SELECT ... FOR UPDATE` in `lockProduct` (lines 37-42), priced from the locked row, and reserved with a conditional `updateMany` whose predicate includes `stock: { gte: line.quantity }` (lines 158-169).

**Result.** A same-key retry returns the original order with `replayed: true`, and `backend/src/routes/orderRoutes.ts:18` answers 200 instead of 201. Two integration cases pin it: "serializes simultaneous identical checkout keys into one order and reservation" (`backend/src/__tests__/workflow.integration.test.ts:444`) and "sells the last unit to exactly one of two customers" (line 427). The verification run recorded 80 passing checks in `astraupskill/VERIFICATION.md`.

## STAR story 2: the cart that was a list when it should have been a set

**Situation.** The replay check compares a SHA-256 fingerprint of the cart against the stored `requestHash`, so a key reused with different items conflicts instead of silently returning the wrong order.

**Task.** The first fingerprint hashed `input.items` as sent. A browser that rebuilt the cart in a different order produced a different hash, so an honest retry of the same cart looked like key abuse.

**Action.** I canonicalized the cart before hashing: `sortedItems` at `orderRepository.ts:21-24` sorts by `productId`, and `fingerprint` at lines 25-28 hashes that. The same sorted array is reused as the reservation order at line 88, so every multi-product checkout takes product locks in the same sequence.

**Result.** One change answered two problems: "replays reordered identical carts using the historical price snapshots" (`workflow.integration.test.ts:468`) passes, and consistent lock ordering removed the deadlock a mixed-order pair of carts could cause. The cancellation path sorts the same way at `orderRepository.ts:213-215`.

## STAR story 3: proving that effects and their audit rows commit together

**Situation.** Every write in this codebase also inserts an `AuditEvent`. A reviewer's fair question is whether the audit row can fail while the effect survives.

**Task.** Prove atomicity rather than assert it.

**Action.** The integration suite installs a PostgreSQL trigger that raises on every `AuditEvent` insert and drops it afterwards. Four cases use it, including "rolls back every checkout effect and key receipt when audit insertion fails" (`workflow.integration.test.ts:517`) and "rolls cancellation and restored stock back when its audit fails" (line 638).

**Result.** Each case asserts a 500 with no internal detail leaked, then asserts the database is unchanged, including the checkout key itself, so the customer can retry the same key afterwards. That evidence is copied into `astraupskill/evidence/backend.json`.

## Resume bullets

- Rebuilt the checkout path of a TypeScript/Express/Prisma commerce workspace so that a dropped response is safely retryable, using a client-generated UUID key, a per-key PostgreSQL advisory lock and a durable receipt on a `(userId, checkoutKey)` unique index.
- Removed client-supplied prices, totals, ownership and status from the checkout contract; each line is now priced from a row locked with `SELECT ... FOR UPDATE` and snapshots product name, SKU and price at purchase time.
- Reserved inventory with a conditional `updateMany` on `{ version, stock: { gte: quantity }, active: true }`, so overselling and edits to archived products fail as a 409 instead of as negative stock.
- Wrote 35 integration cases over a helper-owned PostgreSQL cluster covering concurrent checkout for a final unit, key reuse with different carts, stale admin edits and injected audit failures; the full verification run passed 80 checks.
- Documented the honest limits of the system, including the estimated cart total and the simulated `DEMO_PAYMENT` transition, alongside the passing suite.

## 60-second spoken summary

"It is a small commerce app: an Express and Prisma backend over PostgreSQL, a React front end, and a Playwright suite. The interesting part is checkout. The browser generates a UUID and posts it with the cart. The server prices everything itself, so nothing about money comes from the client. Inside one transaction it takes an advisory lock on the customer plus that key, looks for an existing receipt, locks each product row, checks stock and price, creates the order with the price snapshotted onto each line, and decrements stock with a conditional update that also bumps the product version. If the same key comes back, the second request blocks on the lock, then finds the receipt and returns the original order with a 200. If the key comes back with a different cart, that is a 409, because the cart is fingerprinted with SHA-256 over a sorted copy of the items. What it does not do is take payments: the PAID transition writes an audit action called DEMO_PAYMENT, and the cart total in the UI is an estimate because checkout reprices from the database."

## What I would do next

The first gap to close is price quotation, which is task 1 of `astraupskill/05-PRACTICE.md`: `frontend/src/features/cart/CartPanel.tsx:147-148` shows an estimated total while the server charges current prices, so a price change between cart and checkout is invisible to the customer. A quote step carrying an accepted total, compared inside the checkout transaction and failing with a 409 that returns the new total, keeps checkout idempotency separate from quote identity. Second is replacing absolute stock edits with signed adjustments and a required reason (task 2), so an admin saving a description cannot carry a stale `stock` value into the write at `backend/src/repositories/productRepository.ts:81-88`.
