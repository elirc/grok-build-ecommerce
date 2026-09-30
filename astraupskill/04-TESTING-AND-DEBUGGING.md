# Test rejection, rollback, and uncertain completion separately

Run `npm run test:api` for backend and setup checks, `npm test` to add component tests, and `npm run verify` for the complete local workflow. The helper creates a marked temporary PostgreSQL database and confirms its shutdown before cleanup. The fixtures also verify the database name, loopback hostname, and ownership marker before deleting test rows. Follow [the root guide](../README.md) for the required executables and browser cache.

## The commands behind each layer

Each suite named below has one script entry at the repository root; the helper that creates and tears down the marked temporary PostgreSQL database is the same in all of them. From the root `package.json`, `scripts`:

```bash
npm run test:api      # node scripts/test-database.mjs api      (backend jest --runInBand)
npm test              # node scripts/test-database.mjs backend  (adds component tests)
npm run verify        # node scripts/test-database.mjs verify    (complete local workflow)
npm run test:browser  # node scripts/test-database.mjs browser   (Playwright checkout suite)
```

## The three 500s in the log are deliberate

`evidence/backend-tests.log` contains three `"status":500,"event":"request_failed"` lines. They come from the `auditFailure` helper in `workflow.integration.test.ts`, which installs a trigger that makes the `AuditEvent` insert raise; the assertion is that registration, checkout and the third mutation *roll back* when their audit write fails, and the error handler in `backend/src/lib/errors.ts` logs any 5xx. A passing log therefore contains exactly three such lines, no more. If you want a log with none, map the injected failure to a controlled 503 ("audit unavailable") in the error handler: the rollback assertion stays the same, and the status becomes a deliberate contract instead of an unexplained 500. That is a reasonable follow-up, not a defect in the delivered run.

## Three different outcomes

A validation rejection happens before domain writes. For example, a checkout body with a client-supplied total or duplicate product ID must return 400 and create no order. A transaction failure happens after some work may have begun but before commit. The audit-failure tests deliberately reject an audit insert and assert that order, item, inventory, and receipt changes all roll back.

An uncertain completion is different: the transaction commits, but the browser loses the response. The [browser suite](../browser-tests/commerce.spec.mjs) intercepts checkout, lets the real server complete it, then aborts delivery to the page. It verifies that the frozen attempt remains and that Retry saved checkout sends the same key and cart. The recovered identity, order count, and remaining stock prove that the retry did not buy twice.

Do not simulate uncertainty merely by returning a 503 before the request reaches the API. That tests rejection handling, not recovery of an already committed order. A useful test creates the failure at the boundary associated with the claim.

## Concurrency and exact values

The [integration suite](../backend/src/__tests__/workflow.integration.test.ts) races two customers for one remaining unit, two identical checkout keys, two product edits, two cancellations, and cancellation against simulated payment. Assert the exact winning/losing statuses and inspect persisted stock, versions, and audits afterward. A pair of non-500 responses is not enough evidence.

Money tests include 0.10 plus 0.20, excess fractional precision, and an aggregate order exceeding its storage bound. Valid individual prices do not guarantee a valid total. UUID tests include different case spellings of the same key, because PostgreSQL UUID identity and a raw text lock key must agree. Normalizing before both fingerprint/receipt processing prevents an avoidable mismatch.

## Debug from the retained evidence

For a failed checkout, record the request ID, checkout key, customer identity, submitted product IDs/quantities, status, and observed order ID. Exclude bearer tokens and passwords. A 409 for insufficient stock is different from a 409 for a key already used with different contents; read the controlled error and inspect order history before deciding whether to retry or unlock the cart.

For a stale product edit, compare the captured product version with the current version. A checkout may have advanced it by reserving stock. Loading current values should be an explicit choice after exporting the pending draft. Automatically updating the version would conceal a lost-update risk.

Finally, inspect both UI and database state. The component tests verify HTTP failure handling and catalogue role controls; browser tests prove real draft retention and accepted-save feedback. A production build proves bundling and type compatibility, while a database test proves a different part of the contract. Keep those forms of evidence distinct in your review.
