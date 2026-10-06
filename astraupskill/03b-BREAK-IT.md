# 03b. Break it first

[Course index](README.md) · [Previous](03-WORKED-CHANGE.md) · [Next](04-TESTING-AND-DEBUGGING.md)

Three guards in `backend/src/repositories/orderRepository.ts` carry the course. Remove one at a time, predict, run `npm run test:api` from the repository root, record the failing test name, restore. Do not run `npm test` inside `backend/`: that calls bare `jest --runInBand`, and the integration suite's `beforeAll` (`workflow.integration.test.ts:77-86`) refuses any database not created by `scripts/test-database.mjs`.

## a. Remove the advisory lock

Comment out the line `await tx.$queryRaw\`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))\`;` in `checkout`. Prediction: the concurrent-same-key case ("serializes simultaneous identical checkout keys", `workflow.integration.test.ts:444`) now sees both transactions miss the receipt (`existing` is null for both), both try to create the order, and the unique index on `(userId, checkoutKey)` turns one of them into a P2002. `errors.ts:38-41` maps P2002 to a generic 409, so the test's expected statuses `[200, 201]` become `[201, 409]` instead of a replay. The lock is what makes the *second* caller wait until the first receipt exists.

## b. Stop sorting the items

Change `sortedItems` to `return input.items` (no sort). Prediction: two carts with the same products in reversed order now produce different fingerprints; "replays reordered identical carts" (`workflow.integration.test.ts:468`) gets a 409 "different items" instead of the replayed order, and the database-free contract test "normalizes the fingerprint independently of cart ordering" (`productService.test.ts:126`) fails too. Canonicalization is part of identity. Note that `sortedItems` also sets the product lock order for checkout; unsorted locking reintroduces a deadlock risk between two multi-product carts.

## c. Drop the fingerprint check

Delete `if (existing.requestHash !== hash) throw new AppError(409, ...)`. Prediction: "rejects a used key with different contents" (`workflow.integration.test.ts:459`) replays a *modified* cart under the original key and now receives the original order with `replayed: true` and a 200, silently ignoring the new items. That is the worst outcome of the three: no error, wrong result.

Each step has an existing test that should fail. If one does not, that is a coverage gap worth a test of your own before you continue.
