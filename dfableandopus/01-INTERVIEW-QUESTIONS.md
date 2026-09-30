# Interview questions: commerce workspace

Tiers are **[junior]** or **[mid]**. Every technical answer cites a real path and line.

## Screening

**S1. Describe the data model. [junior]**
Five models in `backend/prisma/schema.prisma`. `User` (line 19) with a `Role` enum of `CUSTOMER|ADMIN`. `Product` (line 30) with a unique `sku`, `price Decimal @db.Decimal(10,2)`, `stock Int`, `active Boolean` and `version Int @default(1)` at line 39. `Order` (line 45) carries `status OrderStatus`, `total Decimal @db.Decimal(12,2)`, `checkoutKey String @db.Uuid`, `requestHash String @db.VarChar(64)` and its own `version`, with `@@unique([userId, checkoutKey])` at line 58. `OrderItem` (line 61) snapshots `productName`, `productSku` and `price` at purchase time. `AuditEvent` (line 73) records actor, resource type, resource id, action and version.

**S2. Why does `OrderItem` duplicate the product name and price? [junior]**
Because an order is a historical fact and a product is mutable. `OrderItem.productName`, `productSku` and `price` (`schema.prisma:65-68`) are written from the row that was locked during checkout (`orderRepository.ts:136-143`), so renaming or repricing a product later does not rewrite what someone bought. The relation is still there for reference, with `onDelete: Restrict` on all three relations (lines 56, 69, 70), which is why you cannot delete a purchased product.

**S3. Walk through a checkout request. [junior]**
`POST /api/orders/checkout` (`backend/src/routes/orderRoutes.ts:12`). Before it, `app.ts` assigns a `requestId` and sets `X-Request-Id`, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` (lines 22-31); CORS rejects a foreign `Origin` with 403 (lines 34-40); the body is capped at 32kb with `strict: true` JSON (line 44); a guard at lines 52-62 rejects query parameters and non-JSON content types on mutating routes; `authenticate(secret)` verifies the bearer token (line 64). The service validates with Zod and calls `checkout` in `orderRepository.ts:85`. The route returns 201 with a `Location` header for a new order, or 200 when `result.replayed` is true (lines 17-19).

**S4. Where is input validated? [junior]**
`backend/src/lib/validation.ts`, entirely with Zod, and every object schema ends in `.strict()` so unknown keys are a 400. `checkoutInput` (line 67) requires `requestId` to be a UUID lowercased by a transform, and `items` to be 1 to 50 entries of `{ productId, quantity }` with quantity 1 to 999; a final `.refine` at lines 86-91 rejects a repeated `productId`. Note what is absent: there is no price, total, status or userId in the schema, so a client cannot claim them. The unit test at `backend/src/__tests__/productService.test.ts:106` is named exactly that: "does not accept client prices totals identities or status at checkout".

**S5. How does authentication work? [junior]**
`backend/src/middleware/auth.ts`. `issueToken` (line 22) signs an HS256 JWT with an empty payload, the user id as `subject`, issuer `commerce-workspace`, audience `commerce-workspace-web` and a 30 minute expiry. `authenticate` (line 38) requires a `Bearer ` header of at most 2048 characters, verifies algorithm, issuer and audience explicitly (lines 46-50), then calls `currentUser`, which re-reads the user and requires `active: true` (lines 31-36). That second database read is the point: a token stays valid for 30 minutes, but a deactivated or demoted account is caught on the next request.

**S6. How is authorization expressed? [mid]**
Two small functions. `requireAdmin` (auth.ts:70) throws 403 for a non-admin. `orderScope` (line 78) returns `{}` for an admin and `{ userId: value.id }` for a customer, and that object is spread into the Prisma `where` of every order query (`orderRepository.ts:45` and `:31`). So a customer fetching another customer's order gets 404, not 403, because the scope is part of the lookup rather than a check after it.

**S7. What does the error handler guarantee? [mid]**
`backend/src/lib/errors.ts:19-69`. `AppError` carries its own status. A `ZodError` becomes 400 with at most six `path: message` pairs joined by semicolons (lines 31-36). Prisma `P2002`, `P2003` and `P2034` become 409 with one shared sentence; any other known Prisma error and an initialization error become 503 (lines 37-50). Body-parser failures map to 413 and 400 (lines 51-59). Only `status >= 500` logs, as `{requestId, status, event: "request_failed"}`. Every response body carries `requestId`.

**S8. What is `P2034` and why is it in the 409 list? [mid]**
It is Prisma's write-conflict / deadlock error, raised when PostgreSQL aborts a transaction that deadlocked or failed to serialize. Grouping it with the unique and foreign-key violations at `errors.ts:38` is a judgement call: all three mean "something else touched this data, reload and retry", which is exactly the sentence the handler returns. The alternative, retrying automatically inside the server, would be wrong here because checkout has side effects the caller is holding a key for.

## Deep dive

**D1. Explain the advisory lock at `orderRepository.ts:93`. [mid]**
`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))` where `lockKey` is `value.id + ":" + input.requestId` (line 92). It is taken *before* looking up the durable receipt at line 94. Two simultaneous requests with the same customer and key would otherwise both find `existing` null, both build lines, and both try `tx.order.create`; the `@@unique([userId, checkoutKey])` index would turn the loser into a `P2002`, which the handler maps to 409 rather than a replay. With the lock, the second transaction blocks until the first commits, then reads the receipt and returns `{ replayed: true }`. The lock is transaction scoped, so it releases on commit or rollback with no cleanup code.

**D2. Why hash the cart at all? [mid]**
`fingerprint` (line 25) is SHA-256 over `JSON.stringify(sortedItems(input))`, and `sortedItems` (line 21) sorts by `productId` so the identity is order independent. It is stored as `requestHash` and compared on replay at line 104. Without it, a client could reuse a key with a different cart and get someone's earlier order back with a 200 and no error at all. That is the worst of the three failure modes listed in `astraupskill/03b-BREAK-IT.md`, because it is silent. The test is `backend/src/__tests__/workflow.integration.test.ts:459`, "rejects a used key with different contents without reserving again", paired with `:468`, "replays reordered identical carts using the historical price snapshots".

**D3. Why is the product row locked with raw SQL? [mid]**
`lockProduct` (lines 37-42) runs `SELECT id FROM "Product" WHERE id=${id} FOR UPDATE` and only then reads the row through Prisma. Prisma has no first-class `FOR UPDATE`, so the raw query takes the row lock and the typed `findUnique` gets the values. Products are locked in sorted order because `items` is `sortedItems(input)` (line 88) and the cancellation path sorts too (line 213): consistent lock ordering is what stops two multi-product operations deadlocking on each other.

**D4. If the row is already locked, why does line 158 still use a conditional `updateMany`? [mid]**
Belt and braces, and cheap. The `where` is `{ id, version: line.version, stock: { gte: line.quantity }, active: true }` and the data does `stock: { decrement }` and `version: { increment: 1 }`. The lock makes the version check redundant *within* this transaction, but the predicate also encodes the business rule (never sell into negative stock, never sell an archived product) as a database condition rather than a JavaScript `if`, and `if (reserved.count !== 1) throw conflict()` at line 170 aborts the whole transaction. It also documents intent for the next reader.

**D5. Why does checkout bump the product's version? [mid]**
So that an administrator editing a product concurrently cannot overwrite a reservation. `productRepository.update` matches `{ id, version: expected }` (line 82); once checkout has incremented the version at line 167, the admin's save matches zero rows, `changed.count !== 1`, and they get the 409 "This record changed. Export pending work, then load the current record before retrying." from `domain.ts:8-12`. The subtlety the course insists on: the admin may only have been editing the description, but their form also carries a stale `stock`, so accepting the stale version would silently undo the sale. `workflow.integration.test.ts:533` covers it: "prevents a stale admin stock edit from overwriting a checkout reservation".

**D6. What is `conflict()` and why is it a function? [junior]**
`backend/src/lib/domain.ts:8-12` returns a new `AppError(409, ...)` each call. It is thrown at six places in `orderRepository.ts` (lines 134, 170, 199, 222, 244) and twice in `productRepository.ts`. Making it a factory rather than a shared instance matters: a single exported `Error` object would share one stack trace across every conflict in the process.

**D7. Walk through the order state machine. [mid]**
`transition` (line 187). Cancellation is the only transition a customer may make: `if (input.status !== "CANCELLED") requireAdmin(value)` at line 193. The row is fetched under scope, locked with `FOR UPDATE` (line 197), re-read, and its version compared with the caller's (line 199). The allowed map at lines 200-206 is `PENDING -> PAID|CANCELLED`, `PAID -> SHIPPED`, `SHIPPED -> DELIVERED`, and `DELIVERED`/`CANCELLED` terminal. Cancelling restores stock per line under product locks, refusing if the restore would push stock past 1000000 (line 217). Finally an `updateMany` matching `{ id, version, status: row.status }` bumps the version, and `count !== 1` is a conflict. The audit action for `PAID` is recorded as `DEMO_PAYMENT` (line 250), which is an honest name: no payment provider exists.

**D8. What breaks if you remove the `status: row.status` clause from line 241? [mid]**
Almost nothing, because `version` is already in the predicate and every transition increments it, so the version alone is sufficient. It is defence in depth against a future code path that changes status without bumping the version. Saying "this clause is currently redundant and here is why I would keep it" is a stronger answer than inventing a failure for it.

**D9. Two customers race for the last unit. What happens? [mid]**
Both transactions enter `checkout`. The first to reach `lockProduct` for that product holds the row lock; the second blocks at `orderRepository.ts:38` until the first commits, then reads `stock` as the decremented value and fails the `product.stock < item.quantity` check at line 127 with a 409 naming the product. Note the order of work: the `Order` row is created at line 147 *before* the reservations at line 158, so the loser's order row is rolled back with everything else. `workflow.integration.test.ts:427` is "sells the last unit to exactly one of two customers".

**D10. Why do audit inserts live inside the transaction? [mid]**
So that an effect and its record commit together. The integration suite proves it with `auditFailure` (`workflow.integration.test.ts:53-66`), a helper that creates a PostgreSQL trigger raising `synthetic internal detail` on every `AuditEvent` insert and drops it in a `finally`. Four cases use it: registration rollback (line 132), product write rollback (line 306), checkout rollback (line 517) and cancellation rollback (line 638). Each asserts the HTTP status is 500 and then asserts the database is unchanged, for example `expect(await prisma.user.count()).toBe(3)` at line 144.

**D11. Those three deliberate 500s: is a 500 the right status? [mid]**
It is the honest one. The trigger raises a generic PostgreSQL error, which is not a `PrismaClientKnownRequestError` with a recognized code, so it falls through every branch of `errorHandler` to the default 500 and the message "The service could not complete this request. Keep your draft and try refreshing." (`errors.ts:25-27`). The error text `synthetic internal detail` never reaches the client, which is the second thing those tests prove. Mapping it to 503 instead would be defensible, and `astraupskill/04-TESTING-AND-DEBUGGING.md` discusses that option; what would be wrong is turning an unknown failure into a 409, because the caller cannot fix it by reloading.

**D12. How does list pagination work, and what is `literal()` for? [mid]**
`findAll` in both repositories runs `findMany` and `count` inside one `prisma.$transaction` with `RepeatableRead` (`orderRepository.ts:65-81`, `productRepository.ts:44-59`), fixed at `take: 20` with `skip: (page - 1) * 20`, ordered by `createdAt desc, id asc` (`domain.ts:7`). `literal` (`domain.ts:5-6`) escapes `\`, `%` and `_` before the value goes into a `contains` filter, so a user searching for `50%_off` does not turn their query into a wildcard. The page number is bounded to 10000 by Zod (`validation.ts:53`).

## Behavioral

**B1. Tell me about a security or correctness problem you inherited. [mid]**
*Situation:* the starter checkout accepted the customer id from the request body, persisted zero for every price and total, and never touched stock. *Task:* make the write trustworthy without changing the client contract more than necessary. *Action:* I moved identity to the verified JWT subject and `orderScope`, removed price, total, status and userId from the Zod schema entirely so they cannot be sent, and priced each line from the product row inside the same transaction that locks and decrements it. *Result:* `productService.test.ts:106` asserts client prices, totals, identities and status are rejected, and `workflow.integration.test.ts:393` asserts the same over HTTP: "rejects client ownership total price and status claims before writing". The full verification run reports 80 checks.

**B2. Describe a design decision you had to justify. [mid]**
Adding a PostgreSQL advisory lock to checkout. The unique index on `(userId, checkoutKey)` already prevented a duplicate order, so the lock is not what makes the system correct; it is what makes the retry return the *right answer*. Without it, the concurrent duplicate surfaces as a 409 from a `P2002`, and the honest retry a customer makes after a dropped response looks like an error. With it, they get their original receipt and a 200. I wrote that reasoning into `astraupskill/03b-BREAK-IT.md` as an experiment the reader runs by commenting out one line.

**B3. When did testing change your design? [mid]**
When I wrote the reordered-cart replay case. I had fingerprinted the cart with `JSON.stringify(input.items)` and the test that sends the same two products in the opposite order under the same key returned a 409 for different items, which is wrong: the cart is a set, not a list. The fix was `sortedItems` (`orderRepository.ts:21-24`), used both for the fingerprint and for the lock ordering during reservation, so canonicalization ended up solving a deadlock question as well. `workflow.integration.test.ts:468` pins it.

**B4. Tell me about something you deliberately did not build. [mid]**
Payment. The `PAID` transition writes an audit action literally named `DEMO_PAYMENT` (`orderRepository.ts:250`) and `astraupskill/VERIFICATION.md` states that payments, shipping, taxes, refunds and notifications are absent, that the browser cart total is an estimate because checkout reprices from the server, and that losing an uncertain checkout key and starting over can create a second order. A payment-provider boundary is task 3 of `astraupskill/05-PRACTICE.md` and is explicitly flagged as a stretch goal. I would rather name those gaps than have an interviewer find them.

**B5. How do you make a failure recoverable for the user rather than just correct for the database? [mid]**
Three habits visible in this codebase. Conflict messages tell the user what to do: "Export pending work, then load the current record before retrying." Refusals name the thing: "Insufficient stock for " plus the product name (`orderRepository.ts:130`). And the idempotency key is client-generated and client-held, so the user's own browser can retry the exact frozen request. The browser suite has a scenario that commits a checkout, drops the response, then retries and asserts inventory moved once.

## Follow-ups the interviewer asks next

**F1. You lock with a hash of the key. What about hash collisions?**
`hashtextextended` returns a 64-bit value, so two different `userId:requestId` strings can collide. The consequence is bounded: a colliding pair serializes against each other unnecessarily, costing a little latency. It cannot cause a wrong result, because the receipt lookup at line 94 uses the real unique index on `(userId, checkoutKey)`, not the hash. That is the right shape for a lock: an optimization whose failure mode is slowness.

**F2. `checkoutKey` is `@db.Uuid` but you lowercase it in Zod. Why both?**
`validation.ts:69-72` validates the UUID and transforms it to lowercase before it is used as part of the lock key and the unique lookup. PostgreSQL's `uuid` type normalizes representations for the column, but the advisory lock is computed over a *string*, so `ABC-...` and `abc-...` would hash differently and two representations of the same key would not serialize. `astraupskill/VERIFICATION.md` records "Mixed-case UUID keys are normalized before locking" as a tested behavior.

**F3. Your transaction takes locks and runs several round trips. What is the timeout?**
`{ maxWait: 10000, timeout: 20000 }` on both `checkout` (line 184) and `transition` (line 256): up to 10 seconds waiting for a connection, 20 seconds for the transaction body. Prisma aborts past that and the error surfaces as a 503 or the generic 500. With a 50-item cart that is 50 sequential lock-and-read round trips, which is the real argument for batching the reads, not the limit itself.

**F4. Could you make deletion of a purchased product work?**
It is deliberately impossible twice over. `OrderItem.product` is `onDelete: Restrict` (`schema.prisma:70`), and `remove` matches `{ id, version: expected, orderItems: { none: {} } }` (`productRepository.ts:101`) then distinguishes the two reasons: a version mismatch is `conflict()`, otherwise "This product appears in order history. Archive it instead of deleting it." Archiving sets `active: false`, which hides it from customers because `rowIn` adds `active: true` for non-admins (line 19). Real deletion would mean either losing history or denormalizing the item snapshot completely and dropping the foreign key.

**F5. Is `RepeatableRead` on the list queries worth it?**
It guarantees `items` and `total` come from one snapshot, so a page never contradicts its own count. The cost is a possible serialization failure under load, which would arrive as `P2034` and be mapped to a 409 (`errors.ts:38`) on a read, which is a strange status for a GET. At this scale it never happens; at scale I would either accept an approximate total or move to keyset pagination and drop the transaction.

**F6. What would you fix first if this went to real users?**
Repricing. The browser shows an estimated total and checkout charges current server prices, so a price change between cart and checkout is invisible to the customer. The fix is a quoted total sent with the checkout and compared server-side, failing with a 409 that returns the new total, which is a small change to `checkoutInput` and to the line-building loop. Payments come second, because `DEMO_PAYMENT` at least does not pretend.
