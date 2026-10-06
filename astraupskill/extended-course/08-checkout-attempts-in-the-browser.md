# 08. Checkout attempts in the browser

[Course index](README.md) · No worked review has been written for lessons 08-11 yet; compare your answers with the cited source and tests instead.

Sources: [CartPanel](../../frontend/src/features/cart/CartPanel.tsx), [application state](../../frontend/src/App.tsx), and [checkout repository](../../backend/src/repositories/orderRepository.ts). A cart describes editable shopping intent. A checkout attempt freezes that intent under a request identity so uncertainty can be resolved without accidentally asking for another purchase.

## The snapshot is created at a deliberate boundary

Before the first submission, the cart can change. Quantities are strings so the input can represent unfinished editing. When checkout begins, the page validates quantity spelling, converts accepted quantities to numbers, and creates an attempt containing a UUID and product-quantity items. The attempt does not include the browser's price estimate as an authoritative total.

The first attempt asks the user to confirm that the demo reserves stock using current server prices and collects no real payment. After confirmation, the snapshot is retained in application state. A retry uses that retained object rather than rebuilding it from a potentially changed cart. This is the client half of the repository's fingerprint contract: a stable key should continue to mean the same item selection.

The interface locks cart editing while an attempt exists. That reduces accidental conflicting key reuse. It does not make the server's fingerprint comparison unnecessary, because other clients or modified requests can bypass the normal controls. The browser lock is a usability safeguard; the server comparison enforces the durable meaning of the request identity.

## A failed response should not manufacture a new intent

Suppose the first request commits but its response is lost. The attempt remains, so the user can retry the same identity and items. The repository can then find the existing order and return it as a replay. If the client generated a fresh UUID on every click, the server would reasonably interpret the next request as a new purchase. Idempotency requires cooperation between a durable server record and a stable client identity.

The application keeps the attempt in memory, not persistent browser storage. Switching between the catalogue and orders views does not erase it because those sections remain mounted and the attempt lives in the parent. Refreshing the page signs the user out and loses the in-memory state. The UI warns before unloading when work exists, but a warning is not durable recovery storage. Exporting the cart and attempt provides a manual artifact, with no automatic import workflow shown here.

An exported attempt should be treated as sensitive purchase intent associated with an account, even though it contains no card data. It can help the user compare order history and identify the original request. It is not a proof that the server accepted the order. The accepted order record and its identity remain the server-side evidence.

## Unlocking is a consequential choice

The reset or unlock path warns the user to check order history before starting a new attempt if checkout is uncertain. Clearing the attempt allows editing and a later new request key. That may be appropriate after a confirmed rejection or a deliberate decision to buy again. It can also create a duplicate business purchase if the earlier request already succeeded and the user mistakes uncertainty for failure.

A good training scenario asks the learner to distinguish three states: confirmed rejected, confirmed accepted, and outcome unknown. Only the third requires investigation before changing intent. The current UI expresses this through warning text and retained attempt state. A future design might provide a dedicated lookup by checkout key, but the present code should not be described as having an endpoint that was not inspected or implemented.

The reset action also clears local error and notice state. That makes the editor usable again, but it can remove the visible reminder of the uncertain operation. A review exercise should consider whether an exported record or order-history link gives enough context before reset. The answer depends on the intended local learning workflow; the important habit is to identify what evidence disappears at each UI action.

## Acceptance precedes cache refresh

On a successful checkout response, the page clears the cart and attempt, records the accepted order, and shows a notice with order identity, total, and status. It then invalidates account-scoped queries. If invalidation fails, the mutation has already been accepted and local state has already changed. The generic workspace catch can report a problem even though the order exists.

This sequencing should shape tests. Resolve checkout with an accepted order, then reject the refresh promise. Assert that the cart is empty, the attempt is cleared, and the accepted order identity is retained. Then assess whether the error wording distinguishes a refresh problem from checkout rejection. The exercise is a proposed component test; it is not a claim that the current code has been modified to split those errors.

## Make recovery observable in a test

Use a controlled request mock to inspect the exact body of the first submission and retry. The UUID and item quantities should remain identical. Simulate a transport failure, try editing a quantity, and verify the attempt lock prevents changing the meaning under the existing key. Then simulate a matching replay response and verify the same order identity is presented without leaving an editable stale cart.

For the server side, use a disposable database to verify one order and one reservation after overlapping matching requests. The component test proves identity retention and user interaction; the database test proves durable deduplication and inventory behavior. Neither substitutes for the other. This division is a practical example of assigning each invariant to the layer that can actually observe it.

### Exercises

**EC08 A.** Trace first checkout, lost response, retry, and replay acceptance. Record the cart, attempt, request key, and accepted order at every stage.

**EC08 B.** Explain what survives a view switch, sign-out, and browser refresh. Identify the role and limitations of export and beforeunload warnings.

**EC08 C.** Design the successful-checkout-then-refresh-failure test. Explain why a generic error banner must not be interpreted as proof that no order exists.
