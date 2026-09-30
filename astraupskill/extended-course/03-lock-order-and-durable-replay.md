# 3. Explain the lock before the receipt lookup

The checkout transaction in [orderRepository.ts](../../backend/src/repositories/orderRepository.ts) acquires a PostgreSQL transaction advisory lock derived from actor ID and request ID before reading the durable order receipt. It then processes products in sorted ID order. This chapter separates same-command serialization from stock-row coordination and explains why both identities matter.

## Same-key competition

Two equivalent requests from Ada share the same actor/key lock input. The transaction acquires that lock before looking up the userId/checkoutKey pair. The intended schedule allows one request to create the order and another to observe and replay it after the first completes. The schema's unique pair remains another protection for durable identity.

Write the schedule with explicit phases: begin, acquire key lock, lookup receipt, acquire product locks, create order, reserve stock, audit, commit and return. A caller's invocation time is not the point at which its command is accepted. A lost response after commit leaves a durable order even if the browser saw a failure.

Hashing the lock input produces a lock key, while the durable lookup still uses the exact user/key pair. A collision in a lock hash would at most require careful analysis of extra serialization; it does not make the receipt query compare only hashes. Do not confuse the advisory-lock identifier with the request-content fingerprint, which is another hash used for a different purpose.

## Receipt comparison comes before current stock

If an existing order is found, the repository compares requestHash. Equivalent content returns orderDto with replayed true. Different content throws a conflict. This happens before product locking and before checking current active flags or stock for a new checkout.

Therefore an equivalent retry can recover an old order even if the product is now archived or has no remaining stock. That is useful: replay should not require reserving the items again. A changed-payload request under the same key should not be treated as a new cart merely because today's inventory could satisfy it.

Create an oracle with two independent views: command receipt and current catalog. The receipt determines whether this logical request was already accepted. The catalog matters when accepting a genuinely new request. Mixing the two can make recovery fail after ordinary catalog evolution.

## Product ordering

For a new checkout, sortedItems produces a deterministic product sequence. lockProduct issues a SELECT FOR UPDATE and then reads the product row. The loop acquires locks in that sorted order. Two carts containing P and Q in opposite client orders therefore request the same product order after parsing and sorting.

Consistent ordering reduces one class of circular wait, but it is not a universal proof that no deadlock or timeout can occur anywhere in the application. Other operations and lock types must be included in a complete analysis. Cancellation restoration also sorts products, which gives the learner another path to compare.

## Validate every observed product

The repository rejects a missing product, an archived product, insufficient stock and an exhausted product version. It accumulates decimal total and line snapshots before creating the order. Each line remembers the product version observed under the lock for the later conditional update.

After order creation, reservation updateMany includes ID, observed version, sufficient stock and active true. It decrements stock and increments version. A count other than one throws conflict. The transaction contains both the order and reservations, so a failure should not leave a partially accepted checkout. That is an intended relational property to establish with the actual database, not with a pure model alone.

## Timeout interpretation

The transaction options set maximum wait and timeout values in milliseconds. Those are local operational bounds, not a guarantee that the browser can infer commit state from elapsed time. A connection or response can fail near acceptance. The client should recover with the same key rather than minting a new one solely because a deadline elapsed.

A load test must distinguish waiting for a connection, waiting for a lock, executing statements and waiting for a response. One aggregate latency number cannot identify the bottleneck. Record the accepted/replayed/conflicting outcomes as well as durations so an apparent throughput improvement cannot hide duplicate orders or lost reservations.

## Evidence design

A focused model can illustrate key ownership and allowed outcomes. A repository mock can assert the order of collaborator calls. A PostgreSQL integration test can verify advisory locks, unique constraints, row locks and rollback under the configured schema. A browser test can verify that the client retains the original key. These are complementary layers.

Before claiming a race is solved, name which layer ran and which invariant it checked. The new course's proposed database experiments remain proposals unless accompanied by recorded execution. Historical test logs in older lessons are not automatically current runs.

## Exercises

EC03-A: draw equivalent and conflicting same-key schedules. Explain why receipt lookup must occur after serialization for the intended design.

EC03-B: trace carts P/Q and Q/P through sorted lock acquisition. Add a third operation and explain why a broader deadlock review still needs its lock order.

EC03-C: design an integration fixture where the second product fails validation after the first was inspected. Assert order, stock and audit outcomes, and distinguish rollback from a lost response after commit.

[Course index](README.md) · [Foundation answers](answers/01-checkout-foundations.md)
