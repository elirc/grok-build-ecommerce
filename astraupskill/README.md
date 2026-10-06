# Commerce course: CRUD with inventory and retryable checkout

This course turns a small ecommerce starter into a study of the boundaries that make CRUD applications dependable. You will work with product records, a cart, authenticated customers, order-line snapshots, inventory updates, and a durable checkout key. The goal is to explain what changes together and what remains recoverable when the browser cannot tell whether a write completed.

The original checkout trusted a supplied customer ID, persisted zero prices and totals, and did not reserve stock. Its frontend had broken API imports and a placeholder Add to Cart button. The improved application offers a complete local workflow whose behavior can be inspected through real HTTP, PostgreSQL, and browser tests.

## Work through one boundary at a time

1. Follow [the setup guide](../README.md) with fictional data. Browse as a customer, create a small cart, place a demo order, and inspect the accepted receipt. Then sign in as the administrator and compare available actions.
2. Read [the codebase map](01-CODEBASE-MAP.md). Trace the verified customer identity, strict checkout input, key lock, product locks, current prices, order insertion, stock reservation, audit, and response.
3. Study [the concepts](02-CONCEPTS.md). Explain why an order ID, a record version, and a checkout key solve different problems.
4. Reconstruct [the worked change](03-WORKED-CHANGE.md). The same checkout key must recover an accepted order after a lost response without reserving another unit.
5. Run [the testing and debugging exercises](04-TESTING-AND-DEBUGGING.md). Compare a rejected transaction with a committed transaction whose response never reaches the browser.
6. Complete [practice work](05-PRACTICE.md), compare [review reasoning](06-SOLUTIONS-AND-REVIEW.md), and perform [the trace lab](07-TRACE-LAB.md).

For a first experiment, open the same product in two administrator tabs. Place an order for that product as a customer. The checkout increments the product version while reducing available stock. A stale admin save must now conflict, even if the administrator was editing the description. Explain why blindly replacing the submitted version would permit an old stock value to overwrite the reservation.

Keep a journal containing observations, hypotheses, experiments, and results. For example, "the browser displayed a network error" is an observation. "No order exists" is a hypothesis that must be checked against the database or order history. The lost-response browser test deliberately disproves that hypothesis.

Your final course artifact should include one complete feature, a rejected-request example, a transaction or migration explanation, and a test that inspects persisted state after failure. You should be able to explain ownership, bounded decimal values, immutable application snapshots, reference-aware deletion, concurrent transitions, and retry identity. Read [verification](VERIFICATION.md) before making claims about live payments, deployment, crash durability, or other behavior outside the demonstrated local system.

After chapter 03 read [03b: break it first](03b-BREAK-IT.md).

## Prerequisites

You should already be comfortable with SQL transactions (BEGIN/COMMIT, what an isolation level changes), HTTP status semantics (200 vs 201, 400 vs 409, when 404 hides existence), and React state updates from async responses. Exercises 1-5 in `05-PRACTICE.md` need only Node 22; Exercises 6-8 need the PostgreSQL test helper. Exercise 9 (a payment-provider boundary with a fake adapter) is a stretch goal, not a required step.


## Extended course

[Continue with the extended upskilling course](extended-course/README.md).
