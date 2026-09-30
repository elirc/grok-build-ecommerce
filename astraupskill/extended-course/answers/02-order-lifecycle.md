# Worked review: order lifecycle and authority

[Course index](../README.md). These answers describe the inspected repository and proposed experiments; they are not a claim that the full database suite ran in this expansion.

## EC05 A: valid targets still need a valid source edge

PENDING permits PAID for an administrator and CANCELLED for an actor authorized to access the order. PAID permits SHIPPED for an administrator. SHIPPED permits DELIVERED for an administrator. DELIVERED and CANCELLED have no outgoing edges. The parser's accepted target enum includes four target values, but it cannot decide whether a target is valid without knowing the current stored status. The repository supplies that state-dependent check.

Inventory changes on checkout and on accepted cancellation. Advancing PAID, SHIPPED, or DELIVERED does not reserve the cart again. A matrix should record CANCELLED restoration separately from the status change because it introduces additional locked products, ceilings, audit events, and rollback obligations. The PAID edge's audit action is DEMO_PAYMENT, which should remain explicit in the review artifact.

## EC05 B: the winning edge determines the stock result

If PAID wins from the original PENDING version, the order advances and inventory remains reserved. The competing cancellation request carries a stale version and must not restore stock. If CANCELLED wins, the order advances to cancellation, each accepted line quantity is restored, and the competing payment request must not move the cancelled order forward. In either settled schedule, there should be one accepted transition from the shared baseline.

The test should inspect the final status, version, inventory quantities, and audit actions. A pair of HTTP statuses alone is insufficient because an implementation could reject the loser after a partial effect. Use independent connections and a controlled barrier where possible. Record that a proposed schedule is unexecuted until the database experiment actually runs.

## EC05 C: the claim must match the operation

A precise test name is records the permitted demo payment transition for an administrator. The current implementation does not prove card authorization, capture, settlement, or refund. A real payment claim would require a provider request and response, verified provider event handling, durable correlation to the order, retry and duplicate-event behavior, and reconciliation after uncertain outcomes. It would also need a clear policy for stock reservation while payment is pending.

The absence of those features is not a failure of a local learning workflow. It is a boundary that lets the lesson teach state transitions without misleading users about money movement. A future integration should retain that distinction in both code names and product copy until the external behavior is implemented and verified.

## EC06 A: repeated delivery is different from repeated acceptance

An accepted cancellation advances the order version and leaves the order in a terminal CANCELLED state. Reusing the old version conflicts. Supplying the newer version still does not create a permitted outgoing edge. The normal transition path therefore does not restore the same reservation a second time. The client may still send requests more than once; the durable effect is guarded by state and revision.

Checkout has a different response contract: a matching actor-and-key request can return the existing order with replayed true. Cancellation has no equivalent explicit replay branch. A recovery UI should load current order state after uncertainty rather than assume every retry returns the earlier success payload. This is why one generic retry policy for all mutations can be misleading.

## EC06 B: fail after an earlier restoration to test rollback

Create an order with two products whose IDs sort in a known order. Set the first product's current stock so its restoration fits, and set the second so adding its accepted quantity exceeds the ceiling. Request cancellation with the current order version. The first restoration is attempted before the second check fails. After rejection, assert that both products retain their pre-request stock and versions, the order remains PENDING at its old version, and no RESTORE or cancellation acceptance events remain.

Those postconditions distinguish transactional rollback from merely detecting the overflow. If the first product remains incremented, the operation is partially applied even though the response is an error. A database test is required to establish the real rollback behavior; an in-memory model can teach the intended invariant but cannot certify the engine's execution.

## EC06 C: active status governs new availability

The cancellation branch retrieves referenced products for restoration without applying the new-checkout active check. An inactive product can therefore receive restored quantity, provided the stock and version ceilings permit it and the order transition is valid. Archiving changes future catalog availability; it does not erase the accepted order's product relationship or quantity.

This behavior supports the deletion restriction on referenced products. Removing the row would undermine later operations that need the reference, while archiving preserves history and operational continuity. The answer should connect both code paths rather than treating archive as merely a cosmetic UI flag.

## EC07 A: current account state is checked after token verification

A token can pass signature, issuer, audience, expiry, and subject checks while its user no longer qualifies as active. The current-user lookup then fails and the request is rejected. Signature failure instead stops at token verification. Both may produce authentication-oriented responses, but they represent different causes and should be separate test fixtures.

The practical result is that an old browser session does not preserve an account's former active status for protected requests. The frontend may still hold stale display data, so a good interaction retains unsaved work and explains the need to sign in or review access. It must not assume that a valid-looking local session guarantees current server authority.

## EC07 B: scope and role form a product of conditions

A customer may read their own order and may cancel it only from a cancellable state with the expected version. Another customer's order is outside scope. An administrator can inspect orders across ownership, but still must obey lifecycle and version rules. Product update is administrator-only. Inactive-product listing is likewise restricted rather than treated as a normal customer filter.

The matrix should include an inactive account and an unknown role-shaped fixture to expose assumptions about actor validity. For HTTP tests, the actor must come through authentication. For repository tests, explicitly state that the fixture supplies an actor and therefore does not test token provenance. This keeps the evidence boundary clear.

## EC07 C: demotion tests cross browser and server boundaries

Open a product editor while the account is an administrator, change a field locally, then demote the account in a controlled server fixture. Submit the draft using the existing token. The server should load the current customer role and reject the restricted write. Inspect the product row and version to confirm no accepted change. In the browser, assert that the edited field remains and the error is visible.

The server assertion tests current authority and mutation protection. The component assertion tests preservation of work. A full end-to-end scenario connects them, while smaller tests can cover each boundary independently. Neither a hidden button test nor a repository call with a fabricated customer actor is sufficient by itself to establish the complete demotion workflow.
