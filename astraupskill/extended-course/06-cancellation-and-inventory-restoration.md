# 06. Cancellation and inventory restoration

[Course index](README.md) · [Worked review](answers/02-order-lifecycle.md)

Sources: [transition implementation](../../backend/src/repositories/orderRepository.ts) and [product storage](../../backend/prisma/schema.prisma). Cancellation is a compensating business operation within the order lifecycle. It must restore the right inventory exactly once without erasing the historical order that explains why the reservation happened.

## Follow the restoration data back to acceptance

The cancellation branch iterates the accepted order's items, sorted by product ID. It uses their stored quantities to restore stock. The browser does not submit a replacement list of quantities to be returned. This is essential: a cancellation should reverse the reservation represented by the accepted order, not whatever cart the user currently happens to have open.

Each product is locked before restoration. The code checks the supported stock ceiling and product version ceiling, then increments stock and version and inserts a RESTORE audit event associated with the order. The order transition and all product changes occur within the transaction. If any product restoration fails, the intended outcome is that the transaction does not partially cancel the order or partially restore its products.

Sorting restoration locks follows the same general product-ordering discipline used in checkout. A cancellation also acquires the order lock first, so a full deadlock analysis must consider resource classes and all other transaction paths. It is reasonable to identify the local sorted product acquisition; it is not reasonable to claim that one sorted loop proves the entire application deadlock-free.

## Exactly once is expressed through accepted state

After cancellation succeeds, the order's status is CANCELLED and its version has advanced. A repeated request using the old version does not satisfy the current expected-version check. A request using the new version still cannot leave CANCELLED because the lifecycle graph has no outgoing edge from that state. These checks prevent the normal transition path from restoring the same order's inventory repeatedly.

The phrase exactly once should still be used carefully. The repository provides a guarded transactional operation. Network delivery may happen more than once, and callers may receive an uncertain result. What matters is that the durable business effect is accepted once under the defined state and version rules. The response to a repeated cancellation may be a conflict rather than a replayed success. That differs from checkout's explicit idempotency-key recovery behavior.

A useful user-facing recovery flow loads current order state after an uncertain cancellation. If the order is already CANCELLED, the user has evidence of the accepted result. If it remains PENDING, the user must consider whether the earlier operation failed or is still in progress before submitting again. The course should not imply that every mutation has the same retry contract merely because all use HTTP.

## Restoration can exceed a later stock ceiling

Consider a product that had stock ten, then reserved four units for an order. An administrator later sets available stock near the configured ceiling. Cancelling the earlier order adds its four units back. The repository checks the resulting quantity before updating. This creates a meaningful failure case: cancellation can be blocked by current inventory constraints even though the original checkout was valid.

The lesson is to distinguish inventory quantity from a simple reversible counter with no surrounding policy. Administrative corrections, restocking, and reservations all interact. A future inventory ledger could record separate movements rather than treating stock as the only durable quantity, but that would be a design extension. The current application stores stock and audit metadata; it does not expose a complete accounting ledger of warehouse movements.

For a test, place one product safely below the ceiling and a second product at a value that would overflow when restored. Arrange the first product to be visited before the failing second product. After rejection, verify both products and the order remain in their prior accepted states and that no RESTORE events remain. This schedule specifically tests rollback after earlier writes, rather than failing before any work has begun.

## Archiving does not sever the relationship

A product may become inactive after an order is placed. That affects new catalog availability, but the order's product reference and quantity still explain the existing reservation. The cancellation path reads the product by identity and does not impose the new-checkout active requirement. An archived product can therefore still participate in the supported restoration path, subject to stock and version constraints.

Deleting referenced products would make this relationship harder to preserve. The product deletion rule rejects removal when order items refer to the product and directs users toward archiving. This is a good example of two features reinforcing one domain obligation: catalog lifecycle rules protect the data that later order lifecycle operations need.

## Build an inventory reconciliation worksheet

For each product, record starting stock, accepted checkout reservations, accepted restorations, administrative changes, and ending stock. Use order IDs to connect reservation and restoration events. The worksheet should state which evidence comes from current rows and which comes from audit metadata. Because audit records do not necessarily carry every old and new quantity, do not claim they can reconstruct every historical stock value without additional evidence.

Use the worksheet to investigate a cancelled order whose product stock seems unexpected. The correct question is not only whether cancellation added the quantity. Another accepted administrative change may have occurred before or after it. Sequence, version, actor, and operation identity all matter. A good investigation preserves that context rather than treating the latest stock number as a complete history.

### Exercises

**EC06 A.** Explain how the transition graph and expected version prevent a normal repeated cancellation from restoring inventory twice. Contrast that response contract with checkout replay.

**EC06 B.** Design the two-product overflow rollback scenario. State the required ordering, failure point, and final database assertions.

**EC06 C.** Investigate an inactive product in a PENDING order. Predict whether cancellation can restore it and explain why active status has a different role during new checkout.
