# Review reasoning for quotes, stock, and recovery

These are design directions for [the practice tasks](05-PRACTICE.md), not additional implemented capabilities. Use them to challenge your first design and identify where a seemingly convenient shortcut changes the meaning of a request.

## Task 2, worked: stock adjustments

**Schema** (`backend/prisma/schema.prisma`):

```prisma
model StockAdjustment {
  id          String   @id @default(uuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  actorId     String
  delta       Int
  reason      String
  before      Int
  after       Int
  requestKey  String
  createdAt   DateTime @default(now())
  @@unique([productId, requestKey])
}
```

`@@unique([productId, requestKey])` is the idempotency receipt: a retried adjustment with the same key is the same adjustment.

**Validation** (`backend/src/lib/validation.ts`):

```ts
export const adjustmentInput = z.object({
  delta: z.number().int().refine((d) => d !== 0, "delta must not be zero").refine((d) => Math.abs(d) <= 1_000_000, "delta out of range"),
  reason: z.string().trim().min(3).max(200),
  requestKey: z.string().uuid(),
}).strict();
```

**Repository** (`backend/src/repositories/productRepository.ts`), one transaction, no product snapshot:

```ts
export async function adjustStock(actor: Actor, productId: string, input: AdjustmentInput) {
  adminScope(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"stock:" + productId}, 0))`;
    const receipt = await tx.stockAdjustment.findUnique({ where: { productId_requestKey: { productId, requestKey: input.requestKey } } });
    if (receipt) return { adjustment: receipt, replayed: true };
    // Conditional write: the WHERE carries the floor, so a concurrent checkout cannot push us negative.
    const changed = await tx.product.updateMany({
      where: { id: productId, stock: { gte: input.delta < 0 ? -input.delta : 0 } },
      data: { stock: { increment: input.delta } },
    });
    if (changed.count === 0) throw new AppError(409, "Adjustment would make stock negative, or the product is missing.");
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });
    const adjustment = await tx.stockAdjustment.create({
      data: { productId, actorId: actor.id, delta: input.delta, reason: input.reason, requestKey: input.requestKey,
              before: product.stock - input.delta, after: product.stock },
    });
    await audit(tx, actor, "product.stock_adjusted", { productId, delta: input.delta, requestKey: input.requestKey });
    return { adjustment, replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
```

The product's `version` is untouched: an adjustment is not a metadata edit, so it must not invalidate an admin's open metadata form.

**Route** (`backend/src/routes/productRoutes.ts`): `POST /products/:id/adjustments`, admin only, `adjustmentInput.parse(req.body)`, 200 with `{ adjustment, replayed }`; the 409 above is returned as-is.

**Integration test** (`backend/src/__tests__/workflow.integration.test.ts` style): seed a product with stock 5; fire `adjustStock(-3)` and a checkout of 3 concurrently (`Promise.all`); assert exactly one succeeds, the other is 409, `stock` is 2 (never negative), and one `StockAdjustment` row exists. Then replay the same `requestKey`: `replayed: true` and still one row. Then a delta of `-10` on stock 2: 409 and no row. The advisory lock on `stock:<productId>` is what makes "concurrent" deterministic; the checkout path should take the same key when it decrements stock.

## Quotes and checkout identity

A useful quote records the customer, normalized cart, exact prices, total, and expiry or version policy. Decide whether stock is reserved at quote time; a price quote without reservation cannot promise availability. Checkout should verify the quote belongs to the current customer and has not expired before committing the accepted snapshots.

Do not reuse the checkout key for two differently confirmed quotes. Its fingerprint should include the relevant quote identity or accepted pricing payload under your chosen design. If a retry refers to an already accepted order, return that order even if the old quote has since expired. The receipt describes a past accepted action; the quote controls whether a new action may begin.

## Inventory adjustments should update only inventory

An adjustment endpoint might accept `{requestId, expectedVersion, delta, reason}`. Validate integer bounds and require administrator authority. Inside the transaction, conditionally update the stock and version, reject an impossible resulting quantity, and write its audit or adjustment ledger entry. A negative adjustment is not the same business event as fulfilling a customer order, even when both reduce available stock.

A durable receipt can prevent a retry from applying the same delta twice. Consider whether a stale expected version should always conflict or whether an independent delta may safely compose with another change. Either choice needs a clear contract. An absolute replacement from a stale snapshot is much harder to justify because it can erase reservations made after the administrator loaded the form.

## External payment needs reconciliation

Persist payment intent before calling a provider, use a stable provider idempotency key, and store observed outcomes. A network timeout can mean rejection, no contact, or acceptance without a delivered response. Treating every timeout as safe to charge again is incorrect. A fake adapter should let tests reproduce each outcome and verify the recovery procedure.

Webhooks need signature verification, event deduplication, and an allowed transition policy. A repeated event must not fulfill twice or overwrite a newer state with an older one. The database transaction should cover local state and audit updates; it cannot include the provider's independent transaction. Document what reconciliation queries can establish and how unresolved attempts are presented to an operator.

## Imported drafts are proposals, not authority

Validate a cart file into a separate preview object before replacing current local state. Resolve product IDs, display current availability, and compare the file's owner with the active customer. For an exported attempt, retain its original key and normalized items so recovery can find its receipt. If the user chooses to start a new attempt, make that distinction explicit after history review.

Rejecting one invalid line should not leave half the cart imported unless partial import is an intentionally designed feature. Bound the file before parsing and show controlled errors without logging customer data. Saved product names and prices are useful context, but the server still determines what a new checkout may accept.

A strong review includes source of identity, transaction boundary, retry identity, race behavior, failure evidence, and compatibility. Compare those claims with [verification](VERIFICATION.md). A feature is not complete merely because its happy path returned a successful status once.
