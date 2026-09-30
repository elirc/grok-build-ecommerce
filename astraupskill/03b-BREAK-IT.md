# 03b. Break it first

[Course index](README.md) · [Previous](03-WORKED-CHANGE.md) · [Next](04-TESTING-AND-DEBUGGING.md)

Three guards in `backend/src/repositories/orderRepository.ts` carry the course. Remove one at a time, predict, run `npm test` in `backend/` (the integration suite needs the PostgreSQL fixture; see VERIFICATION), record the failing test name, restore.

## a. Remove the advisory lock

Comment out the line `await tx.$queryRaw\`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))\`;` in `checkout`. Prediction: the concurrent-same-key case in `workflow.integration.test.ts` now sees both transactions miss the receipt (`existing` is null for both), both try to create the order, and the unique index on `(userId, checkoutKey)` turns one of them into a P2002 that surfaces as a 500 instead of a replay. The lock is what makes the *second* caller wait until the first receipt exists.

## b. Stop sorting the items

Change `sortedItems` to `return input.items` (no sort). Prediction: two carts with the same products in reversed order now produce different fingerprints; the replay test that sends the reversed cart under the same key gets a 409 "different items" instead of the replayed order. Canonicalization is part of identity.

## c. Drop the fingerprint check

Delete `if (existing.requestHash !== hash) throw new AppError(409, ...)`. Prediction: the test that replays a *modified* cart under the original key now receives the original order with `replayed: true` and a 200, silently ignoring the new items. That is the worst outcome of the three: no error, wrong result.

Each step has an existing test that should fail. If one does not, that is a coverage gap worth a test of your own before you continue.
