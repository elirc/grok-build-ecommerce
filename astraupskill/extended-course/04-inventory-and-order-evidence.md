# 4. Reconcile reservation quantities with accepted orders

An inventory test should connect product stock, accepted order lines and audit evidence. Inspect checkout in [orderRepository.ts](../../backend/src/repositories/orderRepository.ts) and the Product, Order and OrderItem models in [schema.prisma](../../backend/prisma/schema.prisma). The goal is to calculate what must change together and identify which historical values remain stable.

## Reservation arithmetic

Product P starts with ten available units at version seven. Ada checks out three. A successful reservation leaves seven available units and version eight, creates an order line with quantity three, and records a RESERVE audit for P related to the order. The order receives its own CHECKOUT event.

An equivalent replay of the same actor/key/payload should leave those quantities unchanged. It recovers the order rather than performing another decrement. A fresh key with the same items can create another order and reduce stock again if inventory permits. Both calls may look like repeats in a human conversation, but their command identities differ.

Use a ledger with columns initial stock, accepted new reservations, accepted restorations, explicit administrative changes and final stock. Do not compare only order count. One order can reserve several products and quantities, while a replay can increase response count without increasing any reservation.

## Multi-product acceptance

For P with ten units and Q with five, a cart requesting P three and Q two should leave seven and three. The order lines preserve each quantity and accepted unit price. If Q has only one unit, the new checkout should reject without leaving an accepted order or a lasting decrement of P under the intended transaction contract.

A test must inspect the database after the transaction has completed. Observing that the code calculated P's line before rejecting Q is not the same as observing a committed P reservation. Temporary in-memory variables and durable rows belong in different columns of the evidence ledger.

## Product snapshots

OrderItem stores productName, productSku, quantity and price. These snapshots allow an order to explain what was accepted even after the current product changes name or price. The line still references productId, so the current catalog and historical snapshot remain related but distinct.

The product deletion path refuses a product that appears in order history and recommends archiving instead. This protects referenced historical content under the current domain policy. An archive can hide a product from customer browsing without erasing accepted order lines. A future retention or anonymization feature needs to address those relationships explicitly.

## Absolute stock edits

Product update accepts a full product input under an expected version. Stock is one of those fields. An administrator editing an old snapshot should conflict after checkout increments the product version. This is why version participates in both catalog edits and reservations.

However, absolute replacement and adjustment commands express different intent. Set stock to ten is not the same as add two units. A proposed stock-adjustment operation should carry a delta, reason and command identity, then enforce bounds under concurrency. It should not reconstruct a full stale product object merely to change one quantity.

## A conservation worksheet

Start P at ten. Accept order A for three and order B for two. Replay A twice. Cancel A successfully under the current pending-only cancellation contract. The available quantity should become eight: ten minus three minus two plus three. The replays contribute zero additional movement.

Now add an administrator action that sets stock to twelve under the current version. The simple initial-minus-orders equation no longer explains final stock without that administrative change. This shows why an inventory reconciliation report needs every accepted movement or an explicit baseline reset, not just order lines.

The current audit records action, resource, version and related order ID, but it does not store a complete signed quantity ledger in every event. A proposed reconciliation tool may need to derive quantities from related order lines or introduce richer movement records. State that data requirement rather than pretending generic audit metadata already contains all arithmetic.

## Failure classification

Insufficient stock, archived product, missing product, version conflict and database outage are different outcomes. A client should not retry every one identically. Replaying a saved accepted attempt is safe under its key contract; starting a new attempt after changing items is a separate user decision. A database outage may leave uncertainty about acceptance, requiring recovery rather than an immediate fresh key.

Record the last confirmed boundary in incident notes. For example, the client submitted R and lost the response; a later lookup found order O with lines P three and Q two. That evidence supports acceptance even if the first request log ended in an error at the transport layer.

## Exercises

EC04-A: complete the P/Q reservation ledger for success, insufficient Q stock and equivalent replay.

EC04-B: calculate the ten-unit sequence with two orders, two replays and one cancellation. Then add an absolute administrative edit and identify the additional evidence needed for reconciliation.

EC04-C: design a stock-adjustment proposal that preserves product metadata, enforces bounds and records a stable cause. Keep it distinct from the currently implemented full-product update.

[Course index](README.md) · [Foundation answers](answers/01-checkout-foundations.md)
