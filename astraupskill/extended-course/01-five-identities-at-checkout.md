# 1. Name five identities before following checkout

The commerce application has a cart, a checkout attempt, an accepted order, versioned products and later fulfillment transitions. These objects have related lifetimes but different identities. Begin with [orderService.ts](../../backend/src/services/orderService.ts), [orderRepository.ts](../../backend/src/repositories/orderRepository.ts) and [the schema](../../backend/prisma/schema.prisma). The goal is to explain recovery after response loss without creating another reservation accidentally.

## The actor owns the key namespace

The authenticated actor comes from the request's verified user path. Checkout calls orderScope to validate the actor role and identity, then uses the actor's ID with requestId as the durable lookup key. The schema declares a unique combination of userId and checkoutKey. The same textual request ID used by another user therefore belongs to a different namespace.

Do not confuse this with an administrator's read scope. An administrator can view orders more broadly through orderScope, but a checkout created by that actor still writes its own userId from the actor. A request body does not choose an arbitrary customer identity in the strict checkout schema. If an assisted-order workflow is needed later, it should define authority and attribution explicitly.

## Request identity and payload identity

The checkout request contains requestId and an array of product IDs with quantities. The service validates the body before calling the repository. Duplicate products are rejected, quantities are bounded positive integers and the request UUID is normalized to lowercase.

The repository sorts items by product ID and hashes their JSON representation. The hash describes the accepted request's item identity, not the current product catalog or final order identity. Reordering otherwise equivalent item entries should not change this fingerprint after the normal service parsing path. Changing a quantity should change it.

The parsing path matters because a TypeScript type alone cannot canonicalize every possible direct repository caller. When testing the public contract, pass values through the actual schema. When testing an internal helper directly, state its preconditions. The course does not assume arbitrary extra fields or object layouts are accepted by the normal HTTP path.

## The accepted order is another object

Order has its own ID, version, status, total and line snapshots. Its checkout key is retained so a later equivalent request can recover the stored order. Its request hash is used internally for comparison and removed by orderDto before returning the public object.

The returned order on replay is loaded from the current stored row with its line details. If fulfillment has advanced since initial checkout, a replay can return that later status and version while still identifying the same accepted checkout. Exact replay of command identity does not necessarily mean byte-for-byte replay of the original HTTP response body.

This is an important design distinction. A client recovering after response loss usually needs to learn which order exists. A system promising immutable response receipts would need to store or reconstruct that original response separately. Do not claim the current repository implements both semantics without evidence.

## Product identity and product version

Each cart line names a product, while the server reads its current price, stock, active flag and version under a product lock. A product version identifies a catalog revision and participates in the reservation predicate. It is not the checkout request key and not the order version.

A checkout can involve several products at different versions. The repository records a local line structure including each observed version for conditional reservation, then omits that version from the nested OrderItem create data. The order line retains product name, SKU, quantity and price snapshots. It does not expose every temporary reservation field as stored historical content.

## A concrete identity ledger

Use customer Ada, request R, products P and Q, and accepted order O. P starts at version seven and Q at version three. The order begins at its schema default version. Successful reservation advances each product's version, while a later order transition advances O's version. Replaying R should not reserve the same quantities again.

Now let another customer Bea submit the same textual R. That is a separate user/key pair and may create another order if stock permits. Let Ada submit R with a changed quantity. That is conflicting key reuse and should not replace O. Let Ada submit a fresh key with identical items. That is a new attempt and can create another order. These three cases are the minimum useful identity exercise.

## Client state is not durable server evidence

[CartPanel](../../frontend/src/features/cart/CartPanel.tsx) retains an attempt snapshot in component-managed state supplied by its parent. While the attempt exists, cart edits are locked and retry uses the same items and key. An export action can write a draft file. Those mechanisms help the user retain intent, but the server's accepted order remains the authority for whether stock was reserved.

A closed tab, failed network response or stale product display does not prove the absence of an order. Recovery should preserve the original attempt until the accepted outcome can be observed. Starting a new key changes the meaning of the operation and can create another reservation.

## Exercises

EC01-A: construct an identity ledger for Ada/R/P/Q/O through first acceptance, equivalent replay and one fulfillment transition.

EC01-B: compare same-key/different-user, same-key/changed-quantity and new-key/same-items cases. Predict whether each is replay, conflict or a new attempt.

EC01-C: explain why a replay may return a newer order status than the original response. Propose an immutable-response receipt contract separately if a client needs one.

[Course index](README.md) · [Foundation answers](answers/01-checkout-foundations.md)
