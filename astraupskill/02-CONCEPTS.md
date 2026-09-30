# Concepts: three identities and one transaction

## Customer identity, record version, and retry identity

A token identifies the authenticated subject. The current database row supplies the subject's role and active state. A submitted `userId` is not accepted at checkout because a client must not choose another customer's order owner. Order reads, audits, and cancellation use the same ownership scope, with explicit administrator access.

A record version identifies the accepted state an editor started from. Product updates and order transitions include that version in a conditional write. Two callers using version 3 cannot both replace the row: one advances it to 4 and the other conflicts. Product stock reservation also increments the product version, protecting it from stale administrator edits.

A checkout key identifies a logical create attempt. It is scoped to the customer and stored durably on the resulting order. Repeating the same key with the same normalized cart returns that order; changing the cart under a used key conflicts. A key cannot replace authorization or an edit version because it solves a different problem: duplicate creation after an uncertain response.

## A failure may happen after success

A transaction can commit before the browser loses its connection. The customer then sees an error while the order and stock reservation already exist. Retrying with a fresh key would request another order. This app retains the frozen cart and original key in the tab, allowing a retry to recover the existing receipt.

The key survives in PostgreSQL, but the browser's copy is memory-only. Export pending work before reloading if you need that key later. Manual exports are not an automatic restore flow. A replay returns the order's current status, so retrying a cancelled order reports CANCELLED without reserving stock again.

## Money and snapshots

Prices enter the API as bounded decimal strings, are stored as Decimal values, and are summed with exact decimal operations. The frontend estimate uses integer cents. Neither layer silently rounds a three-decimal price into a different accepted amount. The total also has an aggregate storage bound, so a valid set of individual prices can still produce a rejected oversized order.

An order item copies the accepted product name, SKU, and unit price. Later catalogue edits must not rewrite what the customer ordered. Product references remain useful for inventory restoration, while snapshots preserve the original commercial description. These are immutable through the application's order API; an unrestricted database administrator remains capable of changing database records directly.

## Inventory and lifecycle consistency

Checkout locks products in a consistent ID order, verifies current availability, and commits reservations with the order and audits. Two customers competing for the last unit cannot both succeed. Cancellation locks the order, checks its captured version and pending status, restores stock, and records its audit in one transaction. A second cancellation cannot restore the same units again.

Deleting a purchased product is refused because history and cancellation still reference it. Archiving hides it from new customer purchases while retaining the row. Order states after PENDING represent an explicit simulated fulfillment sequence; they do not charge, ship, or refund anything. [The worked change](03-WORKED-CHANGE.md) connects these concepts to the retry path you can inspect in code.
