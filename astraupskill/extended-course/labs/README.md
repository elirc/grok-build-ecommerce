# Checkout schedule lab

Run `node astraupskill/extended-course/labs/checkout-schedules.mjs` from the project root. This dependency-free Node lab writes no files and contacts no server. It distinguishes a matching replay, conflicting request-key reuse, actor namespaces, response loss with the same key, and response loss followed by a new key. A failure schedule restores the model's state to illustrate the intended atomic boundary.

The model deliberately omits prices, authorization middleware, SQL locks, transaction isolation, and real concurrency. It does not import application code. A green result confirms the model's stated examples only. Compare it with [orderRepository](../../../backend/src/repositories/orderRepository.ts), where the real implementation uses database locks, Decimal arithmetic, conditional updates, and transaction boundaries.

Predict the stock after each response-loss scenario before executing. Explain why changing a key can be a legitimate second purchase rather than an idempotency violation. Then design a real database test that runs overlapping checkouts on independent connections. Do not claim that this sequential model establishes the database result.

[Course index](../README.md) · [Lab source](checkout-schedules.mjs)
