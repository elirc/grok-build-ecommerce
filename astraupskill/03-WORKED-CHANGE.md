# Worked change: recover a checkout after its response is lost

Consider a customer buying two notebooks. The server commits the order, but a network interruption prevents the browser from receiving its response. A simple retry of an ordinary POST could create a second order. The implemented change gives this logical checkout a durable identity and makes its accepted result recoverable.

## 1. Capture a stable request

The [cart panel](../frontend/src/features/cart/CartPanel.tsx) creates a UUID once when the customer confirms checkout. It captures the product IDs and quantities and keeps that exact attempt while the request is unresolved:

```json
{
  "requestId": "abcdef12-3456-4789-abcd-ef1234567890",
  "items": [
    { "productId": "prod_notebook", "quantity": 2 }
  ]
}
```

The customer identity comes from the verified token, and the prices come from locked product rows. A retry reuses the captured body rather than generating a fresh UUID. The UI disables cart changes until the customer either receives an accepted result or explicitly unlocks the cart after reviewing history.

## 2. Normalize and serialize the receipt lookup

[Validation](../backend/src/lib/validation.ts) requires a UUID, normalizes its case, bounds quantities and line count, and rejects duplicate product IDs or extra fields. The repository sorts the cart by product ID and hashes that normalized representation. Reordering identical lines therefore does not produce a different logical payload.

Inside the transaction, [orderRepository.ts](../backend/src/repositories/orderRepository.ts) acquires a PostgreSQL advisory transaction lock derived from customer ID and checkout key. This serializes concurrent uses of that customer's key before checking the unique stored receipt. The database unique constraint remains a final backstop. A different customer may legitimately use the same UUID because the uniqueness scope includes customer identity.

## 3. Return an existing result or create atomically

If an order already has that customer/key pair, compare its stored fingerprint. The same cart returns the existing order with `replayed: true`; different contents receive a conflict. No stock is touched on the replay path, including when the existing order has since been cancelled.

For a new key, lock requested products in a consistent order. Validate activity, availability, and total bounds. Create the order and line snapshots, decrement stock with version increments, and insert product/order audits in the same transaction. Failure of any step rolls back all those effects, including the receipt key.

## 4. Adopt only an accepted response

The browser clears its cart and attempt after receiving the accepted order. A failed response keeps the frozen attempt available for retry and export. If the order was already committed, retry returns HTTP 200 with the existing identity; a first successful create returns HTTP 201. Subsequent list refresh failures do not erase the saved-order notice.

The [lost-response browser scenario](../browser-tests/commerce.spec.mjs) lets the backend finish checkout, discards the response, and retries through the real UI. It compares both submitted bodies, accepted order IDs, remaining stock, and order count. That evidence distinguishes a retryable create design from a button that merely prevents double clicks.
