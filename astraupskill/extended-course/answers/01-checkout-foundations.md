# Worked review: checkout foundations

Use these answers after writing your own traces. They are source-reading conclusions, not a record of a live purchase or database concurrency run. Return to the [course index](../README.md) for the exercises and source links.

## EC01 A: the identities describe different obligations

The authenticated actor identifies whose authority the repository is evaluating. A checkout request key identifies one attempted order within that actor's account. Product IDs identify the catalog records being requested. An order ID identifies the durable aggregate created by an accepted checkout. Product and order versions identify revisions for conditional changes. Replacing any of these with another loses information. An order ID cannot identify a request before the order exists. A product ID cannot tell whether two submissions are retries or two intended purchases. A version number cannot establish who is permitted to access the object.

The repository's unique combination of user ID and checkout key makes the same textual key usable by different users without making their purchases the same request. The advisory lock uses the actor and key for the same reason. That does not mean it is safe to accept an arbitrary user ID supplied by a browser. The actor must come through authentication. A review answer should identify both the source of the actor and the database uniqueness relation; mentioning UUID randomness alone misses the important boundary.

For a successful order followed by a lost response, the retained request key and unchanged item snapshot provide a recovery path. A new key instead asks the server to consider another order. If the original purchase already committed, that second request may legitimately reserve inventory again. The user experience must therefore preserve uncertainty rather than equating a network error with rejection.

## EC01 B: replay is current durable evidence

The existing-order branch compares the stored fingerprint with the incoming fingerprint and returns the existing order through the DTO. It appears before the new-checkout inventory checks. The branch therefore does not need today's stock to satisfy yesterday's accepted reservation. If the order has subsequently been cancelled, a replay can return that cancelled order and its current version. It does not promise to reconstruct the exact JSON body that the first HTTP response would have carried.

This distinction changes the review assertion. Assert that one durable order identity is returned and that the relevant inventory effect is not repeated. Do not assert that the replayed status must always be PENDING. In a controlled test, perform checkout, transition the order through a permitted operation, then replay the original checkout request. The expected identity remains stable while the visible state may have advanced. Record that this is an integration test design until it has actually run against the database.

## EC01 C: authority cannot be borrowed from the cart

A cart line contains a product snapshot because the browser needs a name, price estimate, and convenient editor state. The submitted checkout payload contains product IDs and quantities. The server reloads product state within the checkout transaction and derives accepted prices there. A modified browser price is therefore not an authoritative input to the total. The same principle does not make every browser field irrelevant: requested quantity and product identity are essential untrusted inputs that must be validated.

An effective explanation separates selection from acceptance. The shopper selects products and amounts. The server verifies availability, derives accepted monetary values, and records the order. Authentication associates the attempt with the current account. None of those responsibilities is fulfilled by hiding an input control. The evidence should name the checkout parser and the repository's product lookup rather than relying on what the normal form happens to submit.

## EC02 A: money has a grammar before it has a value

The accepted price input is a decimal string with a restricted grammar. The parser normalizes an accepted value to two decimal places. A numeric JavaScript value, an exponent string, a leading-zero whole number, or a three-decimal fraction is not made valid merely because a developer can convert it with Number. This is a deliberate API contract. It avoids accepting several accidental representations and then arguing later about how they should be rounded.

The lower boundary also has two stages. A string can match the decimal grammar and still fail the positive-value refinement. Thus zero is rejected even though its characters are well formed. A useful table distinguishes wrong JSON type, wrong spelling, out-of-range value, and accepted normalized output. Combining all invalid examples into one vague bucket makes it harder to discover whether a future parser change accidentally broadens the contract.

For quantities, the server requires integer numbers from one through 999. The cart editor holds a string because an input field needs to represent unfinished work, but it submits a number after its own validation. Client validation improves interaction; the server parser remains the authority. The two representations are compatible only when the conversion is explicit and the server still checks the result.

## EC02 B: canonicalization belongs before fingerprinting

Normal service calls parse the input before passing it to the repository. The parser constructs a known object shape and normalizes the UUID spelling. The repository sorts items before serializing them into the request fingerprint. Reordering two valid cart lines therefore should not turn the same logical request into a different purchase intent.

However, a TypeScript type annotation does not execute runtime validation. A direct repository caller could supply an object with unexpected runtime structure. An answer that claims arbitrary JSON objects with semantically equivalent fields always hash identically goes beyond the implementation. The supported proof starts with the validated service output. This is an example of documenting a precondition rather than pretending a lower layer has repeated every upper-layer responsibility.

Duplicate product IDs are rejected by the checkout schema. Without that rule, two lines for one product could complicate both stock arithmetic and the order-item uniqueness constraint. The correct current expectation is rejection, not automatic merging. A future merging policy would need a new quantity-overflow rule and a clearly specified canonical representation before the fingerprint was computed.

## EC02 C: exact arithmetic and exact presentation are separate

The backend uses Prisma Decimal for accepted monetary calculations. Order and product DTOs format decimal values to two places. The frontend's cents helper serves the display estimate using the price strings already expected by the application. These are related but distinct contracts. A convenient display helper should not silently become a general parser for arbitrary monetary text.

For a worked calculation, three units at 12.30 produce a line contribution of 36.90. Two units at 0.05 add 0.10, giving 37.00. The exercise should retain the unit-price snapshots as well as the total. A total alone cannot explain what was charged when the product's current price later changes. The database also has a total ceiling; correct arithmetic does not imply every mathematically valid total fits the supported storage and business range.

## EC03 A: two kinds of lock solve two different collisions

The advisory transaction lock serializes attempts sharing the same actor and request key. Product row locks coordinate inventory decisions for products shared by otherwise unrelated checkout attempts. One shopper using two different keys can still compete for the same last item, so request-key coordination cannot replace inventory coordination. Conversely, product locking alone would not describe whether a repeated attempt should return an existing order.

The repository sorts product IDs before taking product locks. That supplies a common acquisition order across carts that list the same products in different display order. It reduces a familiar source of cycles in checkout-to-checkout contention. It is not a proof that every transaction in the entire application follows the same lock order, nor a promise that no database deadlock can occur. A disciplined answer states the local property and leaves the broader claim for a complete transaction inventory and database test.

## EC03 B: replay precedes new business validation

For an already accepted request, the existing record is the decisive evidence. A matching fingerprint returns that record; a different fingerprint produces a conflict. Stock availability, active status, and current prices belong to the new-checkout branch. If a product is archived after an order was placed, replaying the accepted request should still identify the existing order. The replay is not another attempt to purchase the archived product.

An answer should describe both outcomes for the same key: unchanged item selection is a recovery attempt, while changed quantities are a conflicting reuse. The safest user-facing response to conflicting reuse is not to silently choose whichever body arrived last. That would make the idempotency record ambiguous. Instead, preserve the original accepted meaning and require a deliberate new intent if the shopper wants a separate purchase.

## EC03 C: timeout is not a transaction receipt

The browser's request timer can expire before the repository's transaction timeout. Even apart from those exact durations, transport completion and transaction completion are separate events. Aborting fetch does not establish that the database rolled back. The retained checkout attempt is therefore a meaningful recovery mechanism.

A good test schedule includes commit followed by response loss, failure before commit, and two overlapping retries. The postconditions differ, but a stable request identity lets the client ask the server to resolve the uncertainty. Record the durable order count, inventory change, and replay identity after the system settles. Observing only a rejected browser promise cannot distinguish the schedules.

## EC04 A: snapshots explain historical acceptance

An order item stores product name, SKU, quantity, and unit price alongside its product reference. The reference supports the relationship to the catalog; the snapshots preserve what the accepted order said at that time. A later catalog rename should not rewrite the historical line label. An answer that joins only current product fields for every order display throws away that distinction.

The order total and line snapshots should reconcile. The current schema fixes currency to the supported USD workflow. Introducing multiple currencies would require more than adding a select box: price representation, accepted currency, formatting, totals, and transition behavior would all need an explicit contract. That is a design exercise, not a feature already present in this repository.

## EC04 B: atomicity includes the evidence rows

The checkout transaction creates the order, adjusts stock with conditional updates, and records the associated audit events. If a later step fails within the transaction, the intended result is that earlier transactional writes do not remain independently accepted. This is why an audit insertion failure belongs in a rollback test rather than being dismissed as an optional logging problem.

The source shows where the transaction boundary is declared. A real rollback assertion must be executed against the relevant database engine and schema. A mocked transaction callback that merely invokes its body does not reproduce rollback. It can verify call arguments and rejection paths, but it cannot certify durable atomicity. Keep that distinction visible in the exercise report.

## EC04 C: archive and delete represent different promises

A product referenced by an order cannot be removed through the guarded delete path. The error directs the user toward archiving. Keeping the row supports the existing relation and later inventory operations such as a permitted cancellation. Marking a product inactive prevents new customer-facing availability without pretending its history never existed.

For a deletion review, inspect both the version condition and the absence-of-order-items condition. A stale version is a conflict even before an editor decides whether deletion is otherwise allowed. A reviewer should test a current unreferenced product, a stale unreferenced product, and a current referenced product separately. These cases teach different obligations and should not be collapsed into one generic failure assertion.
