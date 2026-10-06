# Review reasoning for adjustments, quotes, and recovery

Part 1 reviews the code as it ships, with line evidence you can open. Part 2 gives design directions for the Part B tasks in [the practice file](05-PRACTICE.md); those are not implemented capabilities. Answers for the Part A drills are their `Check` lines.

## Part 1: senior review of the shipped code

**Ownership is checked before a lock is taken.** `transition` reads the order through the caller's scope (`orderRepository.ts:196`) before `SELECT ... FOR UPDATE` (line 197), then re-reads it (line 198). The first read stops a customer from taking a row lock on another customer's order; the second is needed because the first may be stale by the time the lock is granted. Copy this order of operations whenever a lock is acquired on a client-supplied id.

**Two styles of guarded write sit side by side.** Checkout already holds the product row lock (`lockProduct`, lines 37-42 and 121), yet the reservation is still a conditional `updateMany` on version, stock, and `active` (lines 158-170). Cancellation's restore under the same kind of lock is an unconditional `update` (lines 223-229). Both are correct while the locks are held. A reviewer should ask for one convention, or a comment explaining why the checkout write re-checks what the lock already guarantees.

**Product audit history is silently truncated.** `history` in `productRepository.ts:115-122` returns the newest 30 events and no total. Every checkout writes a `RESERVE` event per product (`orderRepository.ts:171-179`) and every cancellation a `RESTORE` event (lines 230-238), so a popular product's edit history disappears from the admin view after a few dozen orders, with no "more" signal. Order history (`orderRepository.ts:259-266`) has the same limit, but an order produces at most four events, so it is not a practical problem there.

**One message covers three different database conflicts.** `errors.ts:38-41` maps P2002 (unique), P2003 (foreign key), and P2034 (serialization) to the same 409 text. A duplicate SKU on product create (asserted at `workflow.integration.test.ts:235-243`) therefore says "The record changed or is still referenced", which does not tell the administrator the SKU is taken. A targeted check for P2002 on the `sku` target would be a small, testable improvement.

**Retry identity is canonical in two places that must agree.** The UUID is lower-cased during parsing (`validation.ts:69-72`) before it feeds both the advisory-lock key (`orderRepository.ts:92-93`) and the unique receipt lookup (lines 94-102). If either path used the raw spelling, two casings of one key could pass the lock separately. "Treats differently cased UUID spellings as the same concurrent receipt key" (`workflow.integration.test.ts:793`) pins this.

## Part 2: design directions for the Part B tasks

### Exercise 6, worked: stock adjustments

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

`@@unique([productId, requestKey])` is the idempotency receipt. Add the back-relation `adjustments StockAdjustment[]` to `Product`.

**Validation** (`backend/src/lib/validation.ts`):

```ts
export const adjustmentInput = z
  .object({
    delta: z.number().int().min(-1000000).max(1000000).refine((d) => d !== 0, "delta must not be zero"),
    reason: text(200),
    requestKey: z.string().uuid().transform((value) => value.toLowerCase()),
  })
  .strict();
```

**Repository** (`backend/src/repositories/productRepository.ts`), using the helpers that already exist (`requireAdmin`, `conflict`, and `audit(tx, actor, resourceType, resourceId, action, version)` from `lib/domain.ts:13-32`):

```ts
export async function adjustStock(value: Actor, id: string, input: AdjustmentInput) {
  requireAdmin(value);
  return prisma.$transaction(async (tx) => {
    // The same row lock checkout and cancellation take (orderRepository.ts:37-42).
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${identity.parse(id)} FOR UPDATE`;
    const receipt = await tx.stockAdjustment.findUnique({
      where: { productId_requestKey: { productId: id, requestKey: input.requestKey } },
    });
    if (receipt) {
      if (receipt.delta !== input.delta || receipt.reason !== input.reason)
        throw new AppError(409, "This adjustment key was already used with different values.");
      return { adjustment: receipt, replayed: true };
    }
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) throw new AppError(404, "Product not found.");
    const after = product.stock + input.delta;
    if (after < 0 || after > 1000000)
      throw new AppError(409, "This adjustment would move stock outside 0 to 1000000.");
    if (product.version >= 2147483647) throw conflict();
    await tx.product.update({
      where: { id },
      data: { stock: after, version: { increment: 1 } },
    });
    const adjustment = await tx.stockAdjustment.create({
      data: { productId: id, actorId: value.id, delta: input.delta, reason: input.reason,
              requestKey: input.requestKey, before: product.stock, after },
    });
    await audit(tx, value, "PRODUCT", id, "ADJUST", product.version + 1);
    return { adjustment, replayed: false };
  });
}
```

**Why the version must still increment.** It is tempting to say an adjustment is "not a metadata edit" and leave `version` alone. In this codebase that loses data: `update` writes every field, including absolute `stock`, from the admin's form (`productRepository.ts:81-88`), guarded only by the version. An admin who opened the form before the adjustment would overwrite it. Checkout bumps the version for exactly this reason, and "prevents a stale admin stock edit from overwriting a checkout reservation" (`workflow.integration.test.ts:533-557`) proves it. If you want adjustments to stop invalidating open forms, the fix is to remove `stock` from the metadata update, not to skip the version bump.

**Why the receipt compares values.** Returning the old receipt for a reused key with a different delta is the same silent wrong answer that [03b](03b-BREAK-IT.md) step c demonstrates for checkout.

**Route** (`backend/src/routes/productRoutes.ts`): `POST /:id/adjustments`, parse with `adjustmentInput`, respond 201 for a new adjustment and 200 for a replay, matching `orderRoutes.ts:16-19`.

**Integration tests**: seed stock 5; run `adjustStock(-3)` and a checkout of 3 with `Promise.all` and assert exactly one succeeds, the other is 409, and stock is 2. Replay the same key: 200, `replayed: true`, one row. Reuse the key with `-1`: 409. Apply `-10` to stock 2: 409 and no new row.

### Exercise 7: quotes and checkout identity

A useful quote records the customer, normalized cart, exact prices, total, and expiry. A price quote without reservation cannot promise availability. Checkout should verify that the quote belongs to the current customer and has not expired before committing snapshots.

Do not reuse one checkout key for two differently confirmed quotes: add the quote identity to the fingerprint. If a retry refers to an already accepted order, return that order even if the quote has since expired. The receipt describes a past accepted action; the quote only controls whether a new action may begin.

### Exercise 8: imported drafts are proposals, not authority

Validate the file into a separate preview object before replacing local state. Resolve product ids, show current availability, and compare the file's owner with the active customer. For an exported attempt, keep its original key and normalized items so recovery finds its receipt. Starting a new attempt instead must be an explicit choice after history review.

Rejecting one invalid line should not leave half the cart imported unless partial import is a designed feature. Bound the file before parsing and do not log customer data. Saved names and prices are context only; the server still decides what a new checkout accepts.

### Exercise 9: external payment needs reconciliation

Persist payment intent before calling a provider, use a stable provider idempotency key, and store observed outcomes. A timeout can mean rejection, no contact, or acceptance without a delivered response, so treating every timeout as safe to charge again is wrong. The fake adapter should let tests reproduce each outcome.

Webhooks need signature verification, event deduplication, and an allowed-transition policy, so a repeated event cannot fulfill twice or overwrite a newer state. The database transaction covers local state and audit only; it cannot include the provider's transaction.

A strong review states the source of identity, the transaction boundary, retry identity, race behavior, failure evidence, and compatibility. Compare those claims with [verification](VERIFICATION.md).
