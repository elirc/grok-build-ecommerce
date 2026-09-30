# Flashcards: commerce workspace

Cover the right column. Answers are specific to this repository.

| Question | Answer |
|---|---|
| What makes a checkout retry safe? | A client UUID `requestId` stored as `Order.checkoutKey`, unique per customer via `@@unique([userId,checkoutKey])` (`backend/prisma/schema.prisma:58`) |
| Which lock is taken first in `checkout`? | `pg_advisory_xact_lock(hashtextextended("<userId>:<requestId>",0))` at `backend/src/repositories/orderRepository.ts:93` |
| What is the advisory lock for, given the unique index? | It makes a duplicate return the original order with 200 instead of failing as a `P2002` 409 |
| Status for a new order vs a replay? | 201 vs 200, chosen at `backend/src/routes/orderRoutes.ts:18` from `result.replayed` |
| What header does checkout always set? | `Location: /api/orders/<id>` (`orderRoutes.ts:17`), exposed to the browser by the CORS `exposedHeaders` list |
| How is the cart fingerprinted? | SHA-256 over `JSON.stringify(sortedItems(input))`, `orderRepository.ts:25-28` |
| Why sort the items before hashing? | The cart is a set; reordering must not change the identity. Same array also fixes lock order (`orderRepository.ts:88`) |
| Same key, different cart? | 409 "This checkout key was already used for different items", `orderRepository.ts:104-108` |
| Which test pins the reordered replay? | "replays reordered identical carts using the historical price snapshots", `backend/src/__tests__/workflow.integration.test.ts:468` |
| How is a product row locked? | Raw `SELECT id FROM "Product" WHERE id=$1 FOR UPDATE` in `lockProduct`, `orderRepository.ts:38` |
| Why raw SQL for the lock? | Prisma has no first-class `FOR UPDATE`; the typed `findUnique` on line 39 reads the values afterwards |
| The reservation predicate? | `{ id, version, stock: { gte: quantity }, active: true }`, `orderRepository.ts:159-164` |
| What happens on `reserved.count !== 1`? | `throw conflict()` at line 170, which rolls back the order row created at line 147 |
| Why does checkout bump `Product.version`? | So a concurrent admin save matching the old version updates zero rows and 409s (`backend/src/repositories/productRepository.ts:81-92`) |
| Two customers, one unit left? | The second blocks on the row lock, then fails `product.stock < item.quantity` with 409 naming the product (`orderRepository.ts:127-133`) |
| Which test covers that? | "sells the last unit to exactly one of two customers", `workflow.integration.test.ts:427` |
| Cart size limits? | 1 to 50 items, quantity 1 to 999, no repeated `productId` (`backend/src/lib/validation.ts:73-91`) |
| What may the client send at checkout? | Only `requestId` and `items`; the schema is `.strict()` so `total`, `price`, `userId`, `status` are 400s |
| Which unit test names that rule? | "does not accept client prices totals identities or status at checkout", `backend/src/__tests__/productService.test.ts:106` |
| Why lowercase the `requestId`? | The advisory lock hashes a string, so two spellings of one UUID must normalize first (`validation.ts:69-72`) |
| Order state machine? | PENDING to PAID or CANCELLED, PAID to SHIPPED, SHIPPED to DELIVERED, DELIVERED and CANCELLED terminal (`orderRepository.ts:200-206`) |
| Which transition may a customer make? | Only CANCELLED; anything else calls `requireAdmin` at `orderRepository.ts:193` |
| What does cancellation do to stock? | Restores per line under product locks, refusing if restore would exceed 1000000 (`orderRepository.ts:216-221`) |
| Audit action written for PAID? | `DEMO_PAYMENT` (`orderRepository.ts:250`), because no payment provider exists |
| Transition write predicate? | `{ id, version: input.version, status: row.status }`, `orderRepository.ts:241` |
| Which Prisma codes map to 409? | `P2002`, `P2003`, `P2034` at `backend/src/lib/errors.ts:38` |
| What is `P2034`? | A write conflict or deadlock aborted by PostgreSQL |
| Which statuses log? | Only `status >= 500`, as `{requestId, status, event: "request_failed"}` (`errors.ts:61-68`) |
| Body size limit and its status? | 32 KiB (`backend/src/app.ts:44`); `entity.too.large` becomes 413 at `errors.ts:52-54` |
| Query parameters on a POST to `/api`? | 400, "Mutation routes do not accept query parameters" (`app.ts:54-57`) |
| Wrong content type on a mutation? | 415, "Send application/json" (`app.ts:58-59`) |
| A foreign browser `Origin`? | 403 from the CORS callback at `app.ts:34-40` |
| How many Zod issues reach the client? | At most six, joined by "; " (`errors.ts:33-36`) |
| Why does every response carry `requestId`? | Set once at `app.ts:22-31` as `X-Request-Id`, echoed in the body at `errors.ts:69`, so a user report maps to one log line |
| Page size and ordering of lists? | Fixed `take: 20`, `skip: (page-1)*20`, ordered `createdAt desc, id asc` (`orderRepository.ts:71-74`) |
| Isolation level on list queries? | `RepeatableRead`, so `items` and `total` come from one snapshot (`orderRepository.ts:80`) |
| What does `literal()` protect? | It escapes `\`, `%` and `_` before a `contains` filter, so a search string cannot act as a wildcard |
| How is a customer stopped from reading another's order? | `orderScope` is spread into the `where` of the lookup, so the answer is 404 rather than 403 |
| Why does `OrderItem` copy name, SKU and price? | An order is a historical fact; the snapshot is written from the locked row (`schema.prisma:65-68`, `orderRepository.ts:136-143`) |
| Can a purchased product be deleted? | No: `onDelete: Restrict` (`schema.prisma:70`) and `orderItems: { none: {} }` in the delete predicate (`productRepository.ts:101`); archive instead |
| Transaction limits on checkout? | `{ maxWait: 10000, timeout: 20000 }` milliseconds (`orderRepository.ts:184`) |
| How are audit rollbacks proved? | A PostgreSQL trigger raising on `AuditEvent` insert, used by four cases including `workflow.integration.test.ts:517` and `:638` |
| How many checks did verification pass? | 80: 55 backend, 8 frontend, 3 setup, 14 browser (`astraupskill/VERIFICATION.md`) |
| Command that runs the backend suite? | `npm test`, which is `node scripts/test-database.mjs backend` and owns its own PostgreSQL 18 cluster |
| Two limits to state before an interviewer finds them? | The cart total is an estimate because checkout reprices from the server, and throttling is process-local |
