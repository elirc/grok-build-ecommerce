# Map the commerce request from browser to commit

Start with a checkout request and follow its actual execution. The architecture is useful when each layer owns a clear boundary; the number of folders alone does not make the application reliable.

## HTTP, identity, and input

[app.ts](../backend/src/app.ts) builds the Express application independently from the loopback listener in [index.ts](../backend/src/index.ts). It establishes request IDs, bounded JSON bodies, controlled errors, the permitted frontend origin, and authenticated routes. Tests can exercise this application directly without starting the production listener.

[auth.ts](../backend/src/middleware/auth.ts) verifies the token and then reads the current user's activity and role from PostgreSQL. [authService.ts](../backend/src/services/authService.ts) normalizes login and registration input, hashes passwords, and creates customer accounts with a registration audit. Client-supplied role fields are rejected.

[validation.ts](../backend/src/lib/validation.ts) defines product, checkout, transition, and query contracts. The checkout body contains a UUID request ID and bounded unique product/quantity pairs. It does not accept customer identity, prices, totals, or status. Services pass the verified actor separately from parsed editable values.

## Product and order storage

[productRepository.ts](../backend/src/repositories/productRepository.ts) implements bounded catalogue reads and administrator CRUD. It applies captured versions and prevents deletion of products referenced by order items. Customers receive active products; archived records remain available to administrator review and historical orders.

[orderRepository.ts](../backend/src/repositories/orderRepository.ts) owns checkout and status transitions. It normalizes the cart order for fingerprinting, serializes the customer's checkout key, reads any existing receipt, locks requested products in a consistent order, calculates Decimal totals, and commits order, snapshots, stock changes, and audits together. Cancellation locks the order and restores inventory under the same transaction boundary.

[domain.ts](../backend/src/lib/domain.ts) contains DTO conversion, exact decimal serialization, shared audit insertion, literal search escaping, and the details included with an order. [schema.prisma](../backend/prisma/schema.prisma) defines the retained order receipt and product references. The [initial migration](../backend/prisma/migrations/202609090001_commerce_workspace/migration.sql) adds stock, price, quantity, version, currency, and canonical-value constraints.

## Browser state and recovery

[App.tsx](../frontend/src/App.tsx) owns the session, cart, and checkout attempt in memory. Catalogue and order sections remain mounted when switching views, preserving local work. Signing out confirms discarding unfinished work; reloading does not persist a token or cart automatically.

[ProductsPage.tsx](../frontend/src/features/products/pages/ProductsPage.tsx) separates the saved product baseline from editable values. [CartPanel.tsx](../frontend/src/features/cart/CartPanel.tsx) freezes the submitted cart and key, retries the same attempt after uncertainty, and clears it only after an accepted response. [OrdersPage.tsx](../frontend/src/features/orders/pages/OrdersPage.tsx) displays accepted snapshots and version-conditional lifecycle actions.

Finish by reading [the integration suite](../backend/src/__tests__/workflow.integration.test.ts) and [browser scenarios](../browser-tests/commerce.spec.mjs). Find which assertions observe stored stock, which count order receipts, and which prove that a pending cart remains recoverable. Together they establish a much stronger boundary than a successful button click alone.
