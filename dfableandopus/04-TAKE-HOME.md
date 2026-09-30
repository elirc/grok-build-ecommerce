# Take-home: stock adjustments with a reason

Time box: 3 to 4 hours. Work in this repository. You may add files; do not rewrite the checkout transaction.

## Background given to the candidate

Administrators currently change inventory by saving the whole product from a captured version (`backend/src/repositories/productRepository.ts:73-96`). That write carries every field, so an administrator who only meant to fix a description also resubmits whatever `stock` their form loaded. Operations want stock movements to be separately reviewable, with a reason attached, and they want a receiving clerk who double-submits a delivery not to count it twice.

## The assignment

Add an adjustment operation: `POST /api/products/:id/adjustments`, admin only, body `{ requestId, version, delta, reason }`.

1. `requestId` is a UUID. Repeating the same `requestId` for the same product must return the original adjustment result rather than applying the delta again.
2. `delta` is a non-zero integer between -100000 and 100000. `reason` is a trimmed string of 3 to 200 characters.
3. `version` is the product version the administrator captured. A stale version is a 409 with the existing conflict message.
4. The resulting stock must stay inside the bounds the database already enforces (`Product_stock_bounds CHECK ("stock" BETWEEN 0 AND 1000000)`, `backend/prisma/migrations/202609090001_commerce_workspace/migration.sql:119`). A delta that would go below zero or above a million is a 409 that names the current stock.
5. Every applied adjustment increments `Product.version` and writes an `AuditEvent` in the same transaction, with the actor, the action, the resulting version and the reason preserved somewhere durable.
6. A concurrent checkout must not be lost: if checkout increments the version between the administrator's read and their submit, the adjustment fails rather than overwriting the reservation.

## Acceptance criteria

- New Prisma model and migration for the adjustment record, including a unique constraint that makes requirement 1 true in the database and not only in code. Follow the existing migration's style: explicit `CHECK` constraints for the bounds you claim.
- A Zod schema in `backend/src/lib/validation.ts` in the house style: `.strict()`, bounded strings through the existing `text()` helper, and no field the client should not own. Reject `stock`, `price` and `productId` in the body.
- The repository function opens one `prisma.$transaction`, takes the product row lock the way `lockProduct` does at `backend/src/repositories/orderRepository.ts:37-42`, and applies the change with a conditional `updateMany` whose predicate encodes the rule, as the reservation loop does at lines 158-169.
- Replay handling follows checkout: serialize on the key first, then read the durable record. Reuse of the same `requestId` with a different `delta` or a different product is a 409, not a silent replay.
- The route returns 201 for a new adjustment and 200 for a replay, matching `backend/src/routes/orderRoutes.ts:16-19`.
- The existing admin product editor keeps working. If you also change the UI, the smallest useful change is a stock adjustment control in the products page under `frontend/src/features/products/pages/`, which must generate the `requestId` with `crypto.randomUUID()` the way `frontend/src/features/cart/CartPanel.tsx:51` does and keep it across a failed attempt.

## What to submit

- A branch or patch with source, the migration directory and tests.
- `NOTES.md` of at most one page: the schema decision, why your replay key is scoped the way it is, what you did not build, and the one race you are least sure about.
- Test output pasted as text.

## Tests and commands

Put the contract cases in `backend/src/__tests__/productService.test.ts`, which runs without a database, and the concurrency and rollback cases in `backend/src/__tests__/workflow.integration.test.ts`, which needs the helper-owned cluster.

```
npm run db:generate
npm test            # node scripts/test-database.mjs backend
npm run test:api    # HTTP-level run
npm run typecheck
```

`npm test` starts and shuts down its own PostgreSQL 18 cluster through `scripts/test-database.mjs`; the helper refuses an unmarked database, so do not point it at a personal one. At minimum add: a pure-schema case for the body contract, a case that a duplicate `requestId` applies the delta once, a case that a delta below zero is refused, and a case that an adjustment racing a checkout produces exactly one winner. For the last one, copy the pattern of "prevents a stale admin stock edit from overwriting a checkout reservation" at `backend/src/__tests__/workflow.integration.test.ts:533`. If you want to prove the audit row and the effect commit together, the suite already has an `auditFailure` helper used by "rolls back every checkout effect and key receipt when audit insertion fails" (line 517).

## Grading rubric

| Criterion | Strong | Weak |
|---|---|---|
| Correctness of the write | One transaction, product row locked, conditional `updateMany` whose `where` contains the version and the bound, `count !== 1` treated as a conflict | Read the product, compute the new stock in TypeScript, `update` by id |
| Idempotency | Unique constraint on (product, requestId) in the migration, key serialized before the durable record is read, mismatched payload under a used key is a 409 | An in-memory map, or a code-only check with no unique index behind it |
| Validation boundary | `.strict()` Zod schema, bounded reason, no client-owned stock or price, rejection tested by name | Manual `if (!body.delta)` checks in the route, unknown keys ignored |
| Tests | At least one true concurrency case using two overlapping transactions, plus a negative case per rule | Only a happy path, or tests that assert what the code does rather than what the rule is |
| Error behavior | 409 messages name the product and the current stock, 400 for schema failures, nothing internal leaked, `requestId` returned as `backend/src/lib/errors.ts:69` already does | Generic 500s, or a 200 with an error field in the body |
| Migration safety | Additive, has its own directory, defaults chosen so the migration applies to a table with existing rows, constraints declared explicitly | Edits the existing migration file, or relies on `prisma migrate dev --force` reset |
| Communication | `NOTES.md` names the race the candidate is unsure about and the feature they left out | Notes restate the assignment |

## Reviewer's notes

The first thing I open is the migration, then the test file. A migration that edits `202609090001_commerce_workspace/migration.sql` instead of adding a new directory ends the review, because it means the candidate reset their database rather than migrated it.

Second, I look for the unique constraint. Many submissions implement replay as "look for an existing row with this requestId, and if it is missing, insert". Under two concurrent requests both find nothing. If the constraint exists, the loser gets `P2002`, which `backend/src/lib/errors.ts:38` already maps to 409. That is acceptable. Serializing first with an advisory lock, the way `backend/src/repositories/orderRepository.ts:93` does, and returning the original result with a 200 is better, and I will ask why they chose one.

Third, error paths. I will send a delta that takes stock to -1 and read the message. "Conflict" is a pass mark; naming the product and the current stock, as the checkout refusal does at `orderRepository.ts:130-133`, is what the rest of this codebase does.

Fourth, the interaction with checkout. The question I ask in the debrief is: after your adjustment increments the version, what happens to an administrator who had the product form open? The answer I want is that their save now fails with the conflict from `productRepository.ts:89-92`, and that this is correct, because their form carries a stale stock value.

I do not expect a UI. I do expect the candidate to say whether they think adjustments should be visible in the product audit history endpoint, and why.
