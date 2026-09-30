# Trace lab: prove that one checkout remains one order

Use the fictional accounts in [the setup guide](../README.md). Keep a table with actor, product ID, product version, available stock, checkout key, order ID, order status, and response status. Record observations without bearer tokens or passwords.

## The receipt lock you are tracing

Round 3 depends on the first few statements of the checkout transaction: the advisory lock is taken on `userId + ":" + requestId` *before* the durable receipt is read, so a retry of the same key waits rather than racing. From `backend/src/repositories/orderRepository.ts:85-102`:

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
```

## Round 1: create and inspect a cart

Sign in as `customer@example.test`. Add two Everyday notebooks and three Studio pens. The initial seed estimate is 34.75 USD: two times 12.50 plus three times 3.25. Inspect how [the cart panel](../frontend/src/features/cart/CartPanel.tsx) calculates that estimate with integer cents. The final order still uses current server prices, so the estimate is not a locked quote.

Place the demo order and inspect its request. The body contains a UUID request ID and product/quantity pairs. It must not choose the customer ID, total, unit prices, or paid status. Follow authentication, checkout validation, the receipt lock, product locks, order insertion, stock updates, and audits in [orderRepository.ts](../backend/src/repositories/orderRepository.ts).

Record the accepted order ID and each resulting product version. Explain why the order's item names, SKUs, and prices are copied into snapshots rather than always rendered from the current catalogue.

## Round 2: an administrator starts from stale stock

In an administrator tab, load a product before another checkout reserves it. Keep the old editor open, then place the order in the customer tab. Attempt to save the administrator's old draft. Its captured version should conflict, preserving the pending values. Export the draft before loading current stock.

Find the conditional update in [productRepository.ts](../backend/src/repositories/productRepository.ts). Explain why version protection covers the entire editable product even when the administrator intended only a name change. Propose how a narrower metadata mutation might change that contract, and identify the tests it would need.

## Round 3: recover a committed order after transport failure

Run the lost-checkout-response scenario in [the browser suite](../browser-tests/commerce.spec.mjs). The test allows the API to commit and then aborts the response delivered to the page. Observe the frozen cart and saved checkout key. Retry and compare the recovered order ID with the one accepted before the response was lost.

Inspect the test's assertions about request bodies, stock, and order count. Repeating a successful create with a fresh key would be a new purchase request; retaining the original key is the recovery mechanism. Explain why a 503 generated before reaching the API would not reproduce this scenario.

## Round 4: cancel once and retain the receipt

Cancel a pending order as its owner. The order version advances, reserved stock returns, and cancellation audits commit together. Try a stale second cancellation through the API; it must not restore inventory twice. Repeat the original checkout key and cart: the result should be the same order in CANCELLED state, not a new pending order.

Finally, archive a purchased product as administrator and review the old receipt as customer. The historical snapshots remain readable. Attempting to delete that product should be refused because order history still references it. Finish by writing one regression test that checks persisted state after failure, and explain the difference between a retained receipt, a full audit snapshot, and a database backup.
