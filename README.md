# Small Goods commerce workspace

A local learning application for product CRUD, cart editing, reliable checkout, and owned order history. The React interface talks to an authenticated Express API backed by PostgreSQL. Checkout calculates current prices on the server, reserves stock, captures order-line snapshots, and stores a durable retry key in one transaction.

The [detailed learning course](astraupskill/README.md) explains the source, design choices, failure cases, and practice work for progressing from junior to mid-level CRUD development. JOURNAL and PHASE_PLANS remain historical starter notes; this README and the course describe the implemented application.

## Run with fictional local data

Use Node 22, npm, and a fresh dedicated PostgreSQL database. From the project root:

```powershell
npm ci
npm run setup:local
docker compose up -d postgres
npm run db:generate
npm run db:deploy
npm run build
npm run seed --workspace backend
```

Setup exclusively creates a root `.env` for Compose and `backend/.env` for the API. It generates separate database, JWT, and demo-password values and refuses to overwrite either existing file. Read the generated `DEMO_PASSWORD` locally for sign-in. Do not put it in frontend variables, source control, or screenshots. Setup enables the explicitly requested fictional seed through `ALLOW_DEMO_SEED=yes`.

Compose exposes PostgreSQL on `127.0.0.1:5440` with user `commerce_dev` and database `commerce_workspace`. Alternatively, configure a dedicated empty database in `backend/.env` using installed PostgreSQL. The migration creates the initial schema; it does not adapt unknown existing data. The Compose daemon was not exercised during implementation verification, which used installed PostgreSQL executables.

Run these commands in separate terminals:

```powershell
npm run dev --workspace backend
npm run dev --workspace frontend
```

Open `http://127.0.0.1:5176`. The API binds to `127.0.0.1:4003`; Vite proxies `/api`. Use the documented loopback hostname consistently. Optional `frontend/.env` proxy configuration uses `API_PROXY_TARGET` and is loaded by Vite; no credentials belong there.

The seed provides `admin@example.test`, `customer@example.test`, and `other@example.test`, all using the generated demo password. Repeating the seed preserves existing names, passwords, prices, stock, and product edits. Partial seed identities cause a refusal instead of a partial overwrite. You can also register a local customer account; a submitted role cannot create an administrator.

## Catalogue and cart behavior

Administrators can create, edit, archive, and delete unreferenced products. Fields include a canonical unique SKU, name, description, category, positive decimal price, available stock, and active flag. Prices are decimal strings with at most two fractional digits and a maximum of 999999.99. Stock is a whole quantity from zero through 1000000. Updates and deletes carry the captured version.

Customers browse active products and add up to 50 different products to a tab-local cart, with quantities from one through 999. Estimated totals use integer cents. The accepted order uses current server prices and excludes tax and shipping. No real payment is collected.

Checkout freezes the submitted cart and its generated UUID key until a result is known. If the response is lost, Retry saved checkout sends the same key and items. The database returns the existing order instead of reserving stock again. Reusing a key with different items conflicts. Key spelling is normalized, and key scope includes the authenticated customer. Replays return the order's current status, including cancellation, while preserving its accepted item snapshots.

After a rejected or uncertain attempt, you can export the cart and key. Review order history before explicitly unlocking the cart for a new attempt; a new key represents a new order request. Cart contents and keys are held in tab memory, so a reload discards them unless exported. Draft import and automatic merge are not implemented.

## Orders and inventory

Customers can read only their own orders and cancel their own pending orders. Administrators can review all orders and perform the explicit simulated sequence PENDING to PAID to SHIPPED to DELIVERED. PENDING can also become CANCELLED. These controls do not contact a payment, shipping, or refund provider. Paid or later orders cannot be cancelled through this demo.

Cancellation restores reserved stock and records audit events in the same transaction as the status change. Competing actions use the saved version, so only one can win. Product versions also increment when stock is reserved or restored, preventing stale administrative edits from overwriting inventory changes. If manual stock adjustments would make restoration exceed the supported stock limit, cancellation refuses until inventory is reviewed.

Purchased products cannot be deleted; archive them instead. Orders retain accepted product names, SKUs, unit prices, and totals even after catalogue changes. Orders and their retry receipts have no delete endpoint. Audit metadata records changes but is not a full historical restore system.

## Verify the boundaries

```powershell
npm run test:api
npm test
npm run verify
```

The helper creates a marked temporary PostgreSQL cluster, migrates it, runs checks, repeats the seed, confirms shutdown, and removes only its own cluster. Set `POSTGRES_BIN` if needed; Windows defaults to PostgreSQL 18's installation directory. Install the matching Playwright browser with `npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH` to a compatible existing cache. Results go to `.verification` or `COMMERCE_VERIFY_RESULTS_DIR`.

Read [actual verification and limits](astraupskill/VERIFICATION.md). Authentication uses expiring memory-only tokens and current database roles/activity. MFA, email verification, refresh/reset flows, production deployment, live payment processing, and atomic revocation of already in-flight requests are outside this local implementation.
