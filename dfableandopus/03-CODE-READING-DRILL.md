# Code reading drill: six live-screen rounds

Work these with a timer. Say your answer aloud before opening the `<details>`.

## Drill 1: explain this function

From `backend/src/repositories/orderRepository.ts:85-110`.

```ts
export async function checkout(value: Actor, input: CheckoutInput) {
  orderScope(value);
  const hash = fingerprint(input),
    items = sortedItems(input);
  return prisma.$transaction(
    async (tx) => {
      // Serialize the same customer's key before inspecting its durable receipt.
      const lockKey = value.id + ":" + input.requestId;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
      const existing = await tx.order.findUnique({
        where: {
          userId_checkoutKey: {
            userId: value.id,
            checkoutKey: input.requestId,
          },
        },
        include: orderDetails,
      });
      if (existing) {
        if (existing.requestHash !== hash)
          throw new AppError(
            409,
            "This checkout key was already used for different items. Review the original order.",
          );
        return { order: orderDto(existing), replayed: true };
      }
```

<details><summary>What a strong answer says</summary>

Three moves in order. First, `orderScope(value)` is called for its effect of asserting there is an actor at all; the returned scope object is not used here because checkout always writes as `value.id`. Second, the advisory lock serializes the pair (customer, key) for the life of the transaction, so a duplicate in flight blocks rather than racing to `order.create`. It is transaction scoped, so there is no release path to forget. Third, the receipt lookup uses the real unique index `(userId, checkoutKey)`, not the hash, so the lock is only an optimization; the index is the correctness boundary.

The fingerprint decides the difference between a replay and abuse: same key and same cart returns the original order with `replayed: true`, which the route turns into a 200 (`backend/src/routes/orderRoutes.ts:18`); same key and different cart is a 409 with a message that points at the original order rather than inventing a new one.

Weak answers call this "idempotency middleware". It is not middleware, and the receipt is the order row itself, not a separate table.
</details>

## Drill 2: explain this function

From `backend/src/repositories/orderRepository.ts:157-180`.

```ts
      for (const line of lines) {
        const reserved = await tx.product.updateMany({
          where: {
            id: line.productId,
            version: line.version,
            stock: { gte: line.quantity },
            active: true,
          },
          data: {
            stock: { decrement: line.quantity },
            version: { increment: 1 },
          },
        });
        if (reserved.count !== 1) throw conflict();
```

<details><summary>What a strong answer says</summary>

Every business rule for a reservation lives in the `where` clause: the row must be the one we priced (`version`), it must still hold enough stock, and it must still be sellable. `decrement` and `increment` are relative, so the database does the arithmetic and no read-modify-write window exists. `count !== 1` is treated as a conflict, and because this runs inside `prisma.$transaction`, the throw rolls back the `Order` row created a few lines earlier at line 147 together with every earlier reservation in the loop.

The honest extra point: the product row is already locked by `lockProduct` at lines 37-42, so within this transaction the version predicate cannot fail. It stays because it encodes the rule in the database and protects against a future caller that skips the lock. Bumping `version` is what makes a concurrent admin edit fail later at `backend/src/repositories/productRepository.ts:81-88`.
</details>

## Drill 3: spot the bug

This is a mutated copy of `orderRepository.ts:120-144`. Find what was changed and what it costs.

```ts
      for (const item of input.items) {
        const product = await lockProduct(tx, item.productId);
        if (!product.active)
          throw new AppError(409, "A product was archived. ...");
        if (product.stock < item.quantity)
          throw new AppError(409, "Insufficient stock for " + product.name + ". ...");
        total = total.add(product.price.mul(item.quantity));
        lines.push({
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          price: product.price,
          version: product.version,
        });
      }
```

<details><summary>The mutation</summary>

The loop iterates `input.items` instead of the local `items`, which the real code binds at line 88 to `sortedItems(input)`. The functional result is identical for a single request; the damage is concurrent. Two customers buying products A and B in opposite cart order take the row locks in opposite order, so each holds one and waits for the other. PostgreSQL detects the deadlock and aborts one transaction, which reaches the client as a Prisma `P2034` and therefore a 409 from `backend/src/lib/errors.ts:38`, telling a customer to "refresh current records" for a failure they cannot see or fix.

Sorting also removed the `product.version >= 2147483647` guard from this excerpt, which is the second mutation: without it, an `Int` version can overflow on increment.
</details>

## Drill 4: spot the bug

A mutated copy of `transition`, compare with `orderRepository.ts:240-253`.

```ts
      const changed = await tx.order.updateMany({
        where: { id, status: row.status },
        data: { status: input.status, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict();
      await audit(tx, value, "ORDER", id,
        input.status === "PAID" ? "DEMO_PAYMENT" : input.status,
        input.version + 1, id);
```

<details><summary>The mutation</summary>

`version: input.version` was dropped from the `where`. The real code matches on both the version the caller captured and the current status. Losing the version means two administrators who both loaded a `PENDING` order and clicked different buttons no longer both fail: the second one's status predicate is evaluated against a row that is no longer `PENDING`, which does still fail here, but a same-target double submit (two clicks of "mark paid") now succeeds twice, incrementing the version twice and writing two audit rows for one decision.

The audit row is the visible tell. Its version argument is `input.version + 1`, computed from the caller's captured version, so a second success records a version number that no longer matches the row. The case that covers this is "allows only one winner between cancellation and demo payment" at `backend/src/__tests__/workflow.integration.test.ts:664`.
</details>

## Drill 5: predict the status code

For each request, name the status and the code path. Assume a valid customer token unless stated.

1. `POST /api/orders/checkout?dryRun=1` with a valid body.
2. `POST /api/orders/checkout` with `Content-Type: text/plain`.
3. `POST /api/orders/checkout` with `{"requestId":"<uuid>","items":[{"productId":"<id>","quantity":2}],"total":"0.00"}`.
4. The same valid checkout sent twice with the same `requestId` and the same cart.
5. The same `requestId` sent again with one extra item in the cart.
6. A customer sends `PATCH /api/orders/<id>/status` with `{"version":3,"status":"SHIPPED"}` for their own order.

<details><summary>Answers</summary>

1. **400.** The mutating-route guard in `backend/src/app.ts:52-57` rejects any query string on a non-GET `/api` request before the router runs: "Mutation routes do not accept query parameters."
2. **415.** Same guard, `app.ts:58-59`, "Send application/json."
3. **400.** `checkoutInput` is `.strict()` (`backend/src/lib/validation.ts:85`), so the unknown key `total` is a Zod issue, which `errors.ts:31-36` renders as up to six `path: message` pairs. The unit case is "does not accept client prices totals identities or status at checkout" (`backend/src/__tests__/productService.test.ts:106`).
4. **201 then 200.** The second call blocks on the advisory lock, finds the receipt, compares the fingerprint, and returns `replayed: true`; `orderRoutes.ts:18` maps that to 200. Both responses carry `Location: /api/orders/<id>` from line 17.
5. **409.** The receipt exists but `existing.requestHash !== hash` at `orderRepository.ts:104`. No stock is reserved; the case is `workflow.integration.test.ts:459`.
6. **403.** `transition` calls `requireAdmin(value)` for any status other than `CANCELLED` at `orderRepository.ts:193`, before the transaction opens. Cancellation is the only transition a customer may perform.
</details>

## Drill 6: review this diff

Three defects. Find them and say which you would block the merge on.

```diff
--- a/backend/src/repositories/orderRepository.ts
+++ b/backend/src/repositories/orderRepository.ts
@@
 export async function checkout(value: Actor, input: CheckoutInput) {
   orderScope(value);
   const hash = fingerprint(input),
     items = sortedItems(input);
+  const quoted = await fetch(process.env.PRICING_URL + "/quote", {
+    method: "POST",
+    body: JSON.stringify({ items }),
+  }).then((r) => r.json());
   return prisma.$transaction(
     async (tx) => {
@@
       const existing = await tx.order.findUnique({ ... });
-      if (existing) {
-        if (existing.requestHash !== hash)
-          throw new AppError(409, "This checkout key was already used ...");
-        return { order: orderDto(existing), replayed: true };
-      }
+      if (existing) return { order: orderDto(existing), replayed: true };
@@
       for (const line of lines) {
         const reserved = await tx.product.updateMany({
-          where: { id: line.productId, version: line.version,
-                   stock: { gte: line.quantity }, active: true },
+          where: { id: line.productId, version: line.version },
           data: { stock: { decrement: line.quantity },
                   version: { increment: 1 } },
         });
```

<details><summary>Review notes</summary>

**Block on the dropped fingerprint check.** Removing the `requestHash` comparison turns key reuse with a different cart into a silent success that returns someone's earlier order with a 200. It is the only one of the three failures a customer cannot detect. `workflow.integration.test.ts:459` fails immediately, which is the point of having it.

**Block on the narrowed reservation predicate.** Dropping `stock: { gte: line.quantity }` and `active: true` removes the last database-level guard against negative stock. Under the row lock the read at line 127 already checked stock, so it would not fail today, but the predicate is what makes the rule true for any future path. There is a `Product_stock_bounds CHECK ("stock" BETWEEN 0 AND 1000000)` in `backend/prisma/migrations/202609090001_commerce_workspace/migration.sql:119`, so the database would still refuse negative stock, but it would arrive as a raw PostgreSQL error and therefore a 500, not the 409 with the product name that a customer can act on.

**Block on the network call, for a different reason.** It is outside the transaction, which is right, but it is unbounded: no timeout, no `AbortSignal`, and its result is never used. A hanging pricing service now hangs every checkout before a lock is even taken, and `{ maxWait: 10000, timeout: 20000 }` at line 184 does not cover it because the transaction has not started. The course's task 3 in `astraupskill/05-PRACTICE.md` is explicit that a provider call belongs outside the transaction with durable intent and reconciliation, not inside a `$transaction` and not before it without a deadline.

The nit worth raising without blocking: `process.env.PRICING_URL` is read at call time with no validation, unlike the JWT secret, which is checked once at startup by `validateSecret` in `backend/src/app.ts:19`.
</details>
