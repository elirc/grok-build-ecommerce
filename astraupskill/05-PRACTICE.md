# Practice: strengthen one commerce boundary at a time

Choose one task and complete it through schema, service, route, UI, and tests as appropriate. Use fictional products and a fake provider. None of these exercises requires charging money or sending real messages. Write the accepted and rejected examples before implementing the happy path, then compare [the review reasoning](06-SOLUTIONS-AND-REVIEW.md).

## 1. Add a price-confirmation quote

The current cart is an estimate, and checkout uses current server prices. Design a quote step that presents the exact proposed total before final confirmation. Decide whether a quote reserves inventory, how long it remains valid, and whether the product version or a signed server quote identifies the accepted price set.

Test a price change between quote and checkout, a stock change without a price change, an expired quote, and a customer attempting to use another customer's quote. Keep checkout idempotency separate from quote identity: repeating one confirmed attempt must recover its order, while changing the accepted quote is a new logical request. Explain the effect on existing carts and API clients.

## 2. Replace absolute stock edits with adjustments

Administrators currently edit available stock under a captured product version. Add an adjustment operation with a signed quantity delta and a required bounded reason. Preserve the current metadata editor, but make stock changes independently reviewable. Decide whether the adjustment should be idempotent and how it interacts with checkout reservation and cancellation restoration.

Test a decrement that would go negative, an increment beyond the supported limit, a duplicate request, and a checkout occurring concurrently. Do not update the whole product from an old snapshot when only its stock should change. Record the actor, reason, previous quantity, resulting quantity, and related operation identity according to a deliberate audit design.

## 3. Add a payment-provider boundary with a fake adapter

The current PAID transition is explicitly simulated. Design an adapter and a payment-attempt record without calling a live provider. Model pending, accepted, rejected, and uncertain provider outcomes. Specify how webhook retries and an interrupted local response interact with the same payment attempt.

A PostgreSQL transaction cannot roll back an external charge that already happened. Use durable intent, provider idempotency where available, and reconciliation rather than holding a database transaction open across a network call. Demonstrate the crash window after provider acceptance but before the local receipt is saved. Keep payment identity distinct from checkout identity and order version.

## 4. Recover an exported cart safely

Add an explicit import preview for a cart draft. Validate the entire file, bound its byte size and line count, reject unknown fields, and resolve product references through current authorized API reads. Never trust saved prices as the accepted charge amount. Show missing or archived items before applying the import.

If the file contains an existing checkout attempt, preserve its exact key and items for a recovery action. Do not silently turn it into a new purchase. Test a stale product, malformed JSON, an oversized file, a key belonging to a different customer, and a partially invalid cart. Applying the preview should be all-or-nothing for local state, while real checkout still uses its server transaction.

Finish each task with a small review packet: source changes, migration notes, a negative example, a race or failure test, and an explanation of what remains outside the feature. That packet demonstrates mid-level judgment more clearly than adding several unconnected endpoints.
