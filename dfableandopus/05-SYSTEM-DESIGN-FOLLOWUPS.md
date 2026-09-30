# Now scale it: eight follow-ups

Each answer starts from what this code does today.

```
browser (React)                  Express app (backend/src/app.ts)
  cart state + crypto.randomUUID()   requestId + no-store headers   (22-31)
        |                            CORS: foreign Origin -> 403    (34-40)
        |  POST /api/orders/checkout json limit 32kb, strict        (44)
        +-------------------------->  no query params on mutations  (52-62)
                                      authenticate(secret)          (64)
                                              |
                                      orderService -> Zod checkoutInput
                                              |
                        prisma.$transaction  { maxWait 10000, timeout 20000 }
                        +-------------------------------------------------+
                        | pg_advisory_xact_lock(hash(userId:requestId))    | :93
                        | order.findUnique(userId_checkoutKey) -> receipt? | :94
                        |   yes + same hash -> replayed:true  (200)        | :109
                        |   yes + other hash -> 409                        | :105
                        | for each sorted item:                            |
                        |   SELECT id FROM "Product" ... FOR UPDATE        | :38
                        |   price/stock/active checks -> 409               | :122-133
                        | order.create(+items snapshot)                    | :147
                        | updateMany{version,stock>=qty,active} decrement  | :158
                        | audit(PRODUCT RESERVE) / audit(ORDER CHECKOUT)   | :171,181
                        +-------------------------------------------------+
                                              |
                                      PostgreSQL 18 (single instance)
```

## 1. Two app instances behind a load balancer. What breaks?

Almost nothing in checkout, and that is by design. `pg_advisory_xact_lock` at `backend/src/repositories/orderRepository.ts:93` lives in PostgreSQL, not in the process, so two Node instances serialize against each other exactly as two requests on one instance do. Row locks and the `@@unique([userId,checkoutKey])` index in `backend/prisma/schema.prisma:58` are likewise shared.

Two things are process-local and would break. `astraupskill/VERIFICATION.md` records that throttling is process-local: the case "bounds authentication attempts within one process" (`backend/src/__tests__/workflow.integration.test.ts:717`) is honest about the scope, and with N instances an attacker gets N times the budget. The fix is a shared limiter keyed in Redis or at the edge. The second is that there is no revocation store, so a token stays usable for its 30 minute life on any instance; the partial mitigation already present is that `currentUser` re-reads the user and requires `active: true` on every request, so deactivating an account takes effect on the next call. Trade-off: that is one extra database read per request, which is the price of not building a revocation list.

## 2. Multi-tenant: several merchants in one database.

Today there is one implicit tenant. The seam to reuse is `orderScope` in `backend/src/middleware/auth.ts`, which returns `{}` for an admin and `{ userId }` for a customer and is spread into the `where` of every order query (`orderRepository.ts:31` and `:45`). A tenant column would follow the same path: `tenantId` on `User`, `Product` and `Order`, folded into that scope object so it is part of the lookup rather than a check after it, which is also why a cross-tenant fetch would return 404 rather than 403.

Two details do not come for free. `Product.sku` is globally `@unique` (`schema.prisma:32`) and would have to become `@@unique([tenantId, sku])`. And the advisory lock key is `userId + ":" + requestId`; users are already tenant-scoped, so the key stays correct, but a tenant prefix makes the intent readable. The stronger alternative is PostgreSQL row-level security, which moves the guarantee below the ORM, at the cost of every query needing a session variable set on a pooled connection.

## 3. One million orders. Is the list endpoint still usable?

No. `findAll` at `orderRepository.ts:65-81` runs `findMany` and `count` inside a `RepeatableRead` transaction with `skip: (page - 1) * 20`, ordered by `createdAt desc, id asc`. `COUNT(*)` over a million filtered rows is a full scan on every page view, and `OFFSET` at page 500 makes the database walk 10000 rows to throw them away. Zod bounds the page at 10000 (`backend/src/lib/validation.ts:53`), which caps the damage but does not remove it.

Keyset pagination is the answer: carry the last `(createdAt, id)` as a cursor and use the existing `@@index([userId,createdAt,id])` (`schema.prisma:59`), which was already declared in that exact column order. The cost is giving up random page access and the exact total, so the UI changes from "page 7 of 431" to "more". The search branch is worse than the pagination: `productName: { contains: ..., mode: "insensitive" }` at lines 54-57 cannot use a b-tree index at all, and at a million rows needs a trigram index or a real full-text column.

## 4. Checkout is slow with large carts. Where does the time go?

The loop at lines 120-144 does two round trips per item, a `FOR UPDATE` and a `findUnique`, and the reservation loop adds two more, an `updateMany` and an `audit` insert. A 50-item cart, the maximum the schema allows (`validation.ts:83`), is around 200 sequential round trips while holding 50 row locks and one advisory lock, inside a transaction bounded by `{ maxWait: 10000, timeout: 20000 }` at line 184.

The first improvement is not a cache. It is one `SELECT ... FOR UPDATE` over all product ids ordered by id, then one in-memory pass, then a batched audit `createMany`. That keeps the lock ordering guarantee sorted items already provide and collapses the round trips. What cannot be batched is the conditional `updateMany` per line, because each carries its own version and quantity predicate; the alternative is a single `UPDATE ... FROM (VALUES ...)` in raw SQL, which trades type safety for one statement. The real trade-off is lock hold time: fewer round trips means popular products are locked for less time, which is what determines checkout throughput on a hot item.

## 5. Move the audit trail out of the request path?

Only carefully. Today `audit` writes inside the same transaction as the effect, which is what makes the four injected-failure cases meaningful: "rolls back every checkout effect and key receipt when audit insertion fails" (`workflow.integration.test.ts:517`) asserts a 500 and an unchanged database. Publishing to a queue instead would make the audit best-effort, and a crash between commit and publish loses the record silently.

The pattern that keeps both properties is a transactional outbox: keep writing the row inside the transaction, add a `published` flag, and have a worker ship rows to the analytics sink afterwards. That preserves atomicity, costs one background process, and introduces at-least-once delivery downstream, so the consumer must be idempotent on the audit row id.

## 6. Where would you put background jobs, and what is the first one?

There is no job runner today; every effect is synchronous inside a request. The first job is not audit shipping, it is abandoned-key cleanup and reconciliation. `astraupskill/VERIFICATION.md` states plainly that losing an uncertain checkout key and starting again can create a second order. A reconciliation job that flags a customer with two `PENDING` orders holding the same items within a short window turns that documented hazard into an operations alert.

Run it as a separate process against the same database, with an advisory lock around the run so two replicas do not both process a batch. That reuses the same primitive checkout already depends on and needs no new infrastructure, which is the argument against reaching for a queue first.

## 7. Adding payments. What changes structurally?

The `PAID` transition writes an audit action literally named `DEMO_PAYMENT` at `orderRepository.ts:250`; there is no provider. The structural point, which `astraupskill/05-PRACTICE.md` task 3 makes, is that a PostgreSQL transaction cannot roll back a charge that already happened, so the provider call must not sit inside `prisma.$transaction`.

The shape: a `PaymentAttempt` row written durably before the call, with its own identity separate from `checkoutKey` and from `Order.version`; the provider call outside any transaction with the attempt id as the provider's idempotency key; then a second short transaction that records the outcome and, on acceptance, transitions the order. Uncertain outcomes stay `PENDING` and are resolved by a reconciliation poll or webhook, both of which must be safe to receive twice. The crash window to demonstrate is after provider acceptance and before the local receipt is written, and the answer to it is reconciliation, not a longer transaction.

## 8. Observability: what would you add first?

Today `errorHandler` logs only for `status >= 500`, as `{requestId, status, event: "request_failed"}` (`backend/src/lib/errors.ts:61-68`), and every response body and the `X-Request-Id` header carry the same id set at `backend/src/app.ts:22-31`. That is enough to correlate one user report with one log line and nothing else.

First addition: a counter on 409s by reason. Conflicts are this system's normal load-shedding signal, so the rate of "insufficient stock", "key used for different items" and version conflicts is the health metric that actually predicts user pain. Second: transaction duration and lock wait for checkout, because the 20 second transaction timeout will present as a generic 500 and be indistinguishable from a bug without it. Third: a structured log line for every `replayed: true`, which is the only evidence that the idempotency path is being exercised in production rather than merely tested. The trade-off with all three is cardinality; keying any of them by product id would be more useful and would also be the thing that makes the metrics bill grow.

## Translating to .NET, if the role asks

`prisma.$transaction` becomes an explicit `IDbContextTransaction`; the conditional `updateMany` becomes either `ExecuteUpdateAsync` with the same predicate or a `[Timestamp]`/`[ConcurrencyCheck]` column that throws `DbUpdateConcurrencyException`, which you map to 409 where `errors.ts:38` maps `P2002`. `pg_advisory_xact_lock` is still available through raw SQL with Npgsql, which is the honest answer; the framework-native alternative is a receipts table with a unique index and catching the duplicate. Zod maps to FluentValidation with `ValidationProblemDetails`, which already carries a per-field shape similar to the `path: message` pairs produced at `errors.ts:33-36`.
