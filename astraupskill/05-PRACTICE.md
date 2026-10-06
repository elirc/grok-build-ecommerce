# Practice: strengthen one commerce boundary at a time

Part A runs with nothing but Node 22: each drill copies a few lines of real source into a scratch file outside the repo and checks them with `node --test`. Part B changes the application and needs the PostgreSQL helper (`npm run test:api`). Use fictional products and fake providers throughout, then compare [the review reasoning](06-SOLUTIONS-AND-REVIEW.md).

## Part A: runnable drills (no install, no database)

Put each drill in one scratch file, for example `../scratch/commerce.test.mjs`, starting with:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
```

### Exercise 1: literal search escaping

**Goal:** explain why catalogue search for `50%` must not match every product containing `50`.

Copy `literal` from `backend/src/lib/domain.ts:5-6`. Assert that `literal("50%_off\\")` equals `"50\\%\\_off\\\\"` (printed: `50\%\_off\\`) and that `literal("plain")` is unchanged. Then find both call sites (`productRepository.ts:37-39`, `orderRepository.ts:50-56`) and write one sentence on what Prisma's `contains` would do with an unescaped `%`.

**Check:** `node --test ../scratch/commerce.test.mjs` reports `# pass` for the test, and your sentence names `%` and `_` as LIKE wildcards.

### Exercise 2: the checkout fingerprint

**Goal:** prove which parts of a checkout body define its retry identity.

Copy `sortedItems` and `fingerprint` from `backend/src/repositories/orderRepository.ts:21-28` (drop the type annotations). Assert that two bodies with the same lines in reverse order and *different* `requestId` values produce equal fingerprints, and that changing one quantity produces a different fingerprint.

**Check:** the test passes. You can then explain why the `requestId` is deliberately not part of the hash (the key is looked up separately at `orderRepository.ts:94-102`; the hash only answers "same items?").

### Exercise 3: integer-cent estimates and their assumption

**Goal:** reproduce the 34.75 USD estimate from [the trace lab](07-TRACE-LAB.md) and find the input the helper cannot handle.

Copy `cents` and `moneyFromCents` from `frontend/src/api/client.ts:65-73`. Assert `2 * cents("12.50") + 3 * cents("3.25") === 3475`, `moneyFromCents(3475) === "$34.75"`, and `cents("0.10") + cents("0.20") === 30`. Then assert what `cents("1.234")` actually returns.

**Check:** the test passes with `cents("1.234") === 334` (not 123). Write down why this never happens in the running app: every price leaves the API through `toFixed(2)` in `backend/src/lib/domain.ts:33-36` and `:42-49`.

### Exercise 4: the order state machine

**Goal:** confirm the lifecycle rules by computation rather than by reading prose.

Copy the `next` table from `backend/src/repositories/orderRepository.ts:200-206`. Write a breadth-first reachability helper and assert: every status is reachable from `PENDING`; `PENDING` is the only status with an edge into `CANCELLED`; `DELIVERED` and `CANCELLED` have no outgoing edges.

**Check:** the test passes. Then compare with line 193: which edge is the only one a customer may take, and where is that enforced?

### Exercise 5: extend the checkout lab with cancellation

**Goal:** model "restore stock exactly once" next to the existing replay schedules.

Copy `astraupskill/extended-course/labs/checkout-schedules.mjs` to your scratch folder and run it once (`assertions: 16`). Store `items` and `status: 'PENDING'` on each pushed order, add `cancel(db, id)` that restores stock only from `PENDING`, and add assertions: first cancel restores stock, second cancel returns a conflict without changing stock, and replaying the original key returns the same order id without reserving again.

**Check:** your copy prints `"passed":true` with `assertions` equal to 16 plus the number you added (22 with six new checks). Compare your guard with the real one at `orderRepository.ts:207-244`.

## Part B: design-and-build tasks (PostgreSQL helper required)

Write the accepted and rejected examples before the happy path. Finish each with a review packet: source changes, migration notes, a negative example, a race or failure test, and what stays out of scope.

### Exercise 6: replace absolute stock edits with adjustments

**Goal:** let administrators change stock by a signed delta with a reason, without replacing the whole product from an old snapshot.

Today `update` (`productRepository.ts:73-96`) writes every field, including `stock`, from the submitted form under a version check. Add `POST /api/products/:id/adjustments` with a bounded delta, a reason, and an idempotency key. The worked solution in 06 explains why it must still increment the product version.

**Check:** new integration tests pass under `npm run test:api`: a decrement below zero returns 409 and writes no row; a replayed key returns the first adjustment and stock moves once; an adjustment racing a checkout for the last units leaves stock non-negative with exactly one winner; and the existing "prevents a stale admin stock edit" test (`workflow.integration.test.ts:533`) still passes.

### Exercise 7: add a price-confirmation quote

**Goal:** show the exact total before final confirmation, instead of the current estimate.

Decide whether a quote reserves inventory, how long it is valid, and how its identity enters the checkout fingerprint. Keep checkout idempotency separate: repeating one confirmed attempt must recover its order; accepting a different quote is a new logical request.

**Check:** integration tests cover a price change between quote and checkout (rejected or re-quoted, per your contract), an expired quote, another customer's quote (404 or 403, never acceptance), and a replay of an accepted order after its quote expired (200 with the original order).

### Exercise 8: recover an exported cart safely

**Goal:** import a cart draft as a preview that cannot silently become a new purchase.

Bound the file size before parsing, reject unknown fields, and resolve products through current authorized reads. If the file contains a checkout attempt, keep its exact key and items for a recovery action.

**Check:** component tests in `frontend/src/__tests__/` cover malformed JSON, an oversized file, an archived product, and a partially invalid file; in every rejected case the existing cart is unchanged (all-or-nothing). A recovered attempt sends the original `requestId` (assert on the request body, as the lost-response browser test does at `browser-tests/commerce.spec.mjs:264`).

### Exercise 9 (stretch): payment-provider boundary with a fake adapter

**Goal:** replace the simulated PAID transition with a payment-attempt record and a fake provider, without calling a live service.

A PostgreSQL transaction cannot roll back an external charge. Persist the intent first, use a provider idempotency key, store observed outcomes, and reconcile uncertain ones.

**Check:** the fake adapter can return accepted, rejected, and timeout-after-accept; a test for the last case shows that retrying the same attempt does not charge twice and that the order reaches PAID only once.
