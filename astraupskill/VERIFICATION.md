# Verification and practical boundaries

The completed local verification passed **80 checks**: 55 backend tests, eight frontend component tests, three setup tests, and 14 Chromium browser scenarios. The verification helper also generated the Prisma client, applied the fresh migration, ran the fictional seed twice, checked TypeScript, and built the application. It used a helper-owned PostgreSQL 18 cluster on loopback and shut that cluster down afterward. No existing personal database was used for these checks.

## Evidence inside the repo

`astraupskill/evidence/` holds copies of the `full-final` run: `results.json`, `backend.json`, `frontend.json`, `browser.json`, and `backend-tests.log`, `browser-tests.log`, `frontend-tests.log`, `setup-tests.log` (the roll-up across attempts is `results-rollup.json`). The 80-check claim is the sum in `results.json`; open `backend.json` for the per-test names. Earlier attempts (`api-first`, `full-first`) are superseded and were not copied.

## Reproduce the evidence

Follow the root setup requirements, install the locked dependencies with `npm ci`, and run `npm run verify`. The database helper needs local PostgreSQL binaries and the browser suite needs Playwright Chromium installed. Read [the testing guide](04-TESTING-AND-DEBUGGING.md) before running individual suites: integration fixtures must only run against the helper-owned database. The helper refuses an unmarked database. A successful build alone does not establish that stock reservation or authorization works.

The backend cases exercise current account roles, customer order isolation, strict input, exact decimal prices, optimistic product edits, and reference-aware deletion. Concurrent checkouts for the final unit must produce one accepted order. Concurrent requests with the same customer and checkout key must return one logical receipt; changing the cart under that key must conflict. Mixed-case UUID keys are normalized before locking. Injected audit failures verify rollback of checkout, cancellation, registration, and product mutations. Cancellation restores inventory once, and state changes require the captured order version.

The browser scenarios exercise registration, sign-in, catalogue editing, cart quantities, receipts, order transitions, retained drafts, and conflict recovery. One scenario commits a checkout but drops its response, then retries the identical frozen request and verifies that inventory was reserved once. Another deliberately fails catalogue refresh after a successful save so the accepted change remains distinguishable from a read failure.

## Visual review

Reviewed captures show the catalogue and cart at desktop and narrow widths, plus a separate receipt view at both widths. The layout checks also assert that the page does not overflow horizontally. Inspect [desktop catalogue](images/desktop.png), [narrow catalogue](images/narrow.png), [desktop receipt](images/receipt-desktop.png), and [narrow receipt](images/receipt-narrow.png). These are fictional test records; displayed stock can reflect earlier scenarios.

## Limits to explain in a review

This is a local learning application. Payments, shipping, taxes, refunds, and external notifications are not implemented. The displayed cart total is an estimate: checkout uses current server prices, so price quotation and reconfirmation remain a documented extension. Sessions and cart attempts live in memory; draft export is manual, without automatic import or merge. Losing an uncertain checkout key and starting again can create another order, so review order history before unlocking a failed attempt.

Authentication has expiring tokens and process-local throttling, but no MFA, password reset, refresh flow, distributed limiter, or atomic revocation of a request already in flight. The migration targets a fresh dedicated database; unknown existing schemas are not automatically upgraded. Docker configuration was written but not exercised with a daemon. These checks are not a production deployment, comprehensive accessibility audit, or power-loss certification. Explain those boundaries alongside the passing tests rather than equating a green suite with complete operational readiness.
