# Commerce workspace interview pack

This is the job-readiness half of the commerce course. The application is an npm workspace: an Express + TypeScript + Zod + Prisma backend (`backend/`) over PostgreSQL, a React frontend (`frontend/`), and a Playwright browser suite. The subject worth interviewing about is checkout: a customer posts a cart with a UUID `requestId`, the server prices it from the database, reserves stock under row locks, and stores the key as a durable receipt so a lost response can be retried without selling the same unit twice.

## The pitch

"I rebuilt the checkout path of a small commerce app so that it is safe to retry. The original version trusted a client-supplied customer id, wrote zero prices and totals, and never reserved stock. Now the customer identity comes from a verified JWT, prices are read from locked product rows inside the transaction, each line snapshots the price and name at purchase time, and the cart is fingerprinted with SHA-256 so the same checkout key with different items is a 409 rather than a silent replay. A same-key retry is serialized by a PostgreSQL advisory lock and returns the original order with `replayed: true` and a 200 instead of a 201. The verification run passed 80 checks including a browser scenario that commits a checkout, drops the response, retries the frozen request and asserts inventory moved once."

## Target stacks

Directly relevant to Node/TypeScript/Express + Prisma roles. For .NET roles, translate `updateMany({ where: { id, version } })` into an EF Core `[ConcurrencyCheck]` column, `pg_advisory_xact_lock` into `SELECT ... FOR UPDATE` on a receipts table or a distributed lock, and Zod schemas into FluentValidation with `ValidationProblemDetails`.

## Two-week plan

- Days 1-3: [01-INTERVIEW-QUESTIONS.md](01-INTERVIEW-QUESTIONS.md), reading `backend/src/repositories/orderRepository.ts` alongside.
- Days 4-5: [02-STORIES-AND-RESUME.md](02-STORIES-AND-RESUME.md); the numbers come from `astraupskill/VERIFICATION.md` and `astraupskill/evidence/results.json`.
- Days 6-8: [03-CODE-READING-DRILL.md](03-CODE-READING-DRILL.md), timed.
- Days 9-11: [04-TAKE-HOME.md](04-TAKE-HOME.md) against the real test suites.
- Days 12-13: [05-SYSTEM-DESIGN-FOLLOWUPS.md](05-SYSTEM-DESIGN-FOLLOWUPS.md).
- Every day: [06-FLASHCARDS.md](06-FLASHCARDS.md).

Limits to state before an interviewer finds them: there are no payments, taxes, shipping or refunds; the cart total shown in the browser is an estimate because checkout reprices from the server; and losing an uncertain checkout key and starting over can create a second order. All three are written down in `astraupskill/VERIFICATION.md`.
