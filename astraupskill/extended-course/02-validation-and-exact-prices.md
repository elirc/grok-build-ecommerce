# 2. Derive the accepted checkout and price representations

Read [validation.ts](../../backend/src/lib/validation.ts) before discussing money or inventory tests. The code accepts specific representations, not arbitrary values that can be coerced into something convenient. Product prices enter as decimal strings, checkout quantities enter as integers and update versions enter as bounded numeric integers.

## Price strings

The money schema accepts a nonnegative-looking decimal syntax with a bounded whole part and at most two fractional digits, then separately requires the numerical value to be positive. It normalizes the accepted string to two fractional digits by padding. Therefore 1 becomes 1.00 and 1.2 becomes 1.20. It does not round a three-decimal input into an accepted price.

Predict 0, 0.00, 0.01, 01.20, 1., 1e2, a numeric 1.2, and 999999.99. Only values matching both representation and positivity rules survive. The largest listed value is accepted by the price schema, while a value with seven whole digits exceeds the syntax bound. These are exact boundary cases, not a general statement about all currency systems.

The repository creates Prisma.Decimal from the normalized string. The order total uses decimal multiplication and addition. Public DTOs render price and total with two fractional digits. Avoid calculating expected totals with binary floating-point arithmetic when an integer-cent table or exact decimal calculation is straightforward.

## Product fields

Product input normalizes SKU by trimming and uppercasing, then restricts its characters and length. Name and text fields have separate bounds. Stock is an integer between zero and one million. active defaults to true. Unknown keys are rejected by the strict object schema.

An update envelope contains version and a full product object. An omitted optional-by-default text field can become empty rather than preserving the stored value. This is not a generic partial PATCH contract. A client editor should send the intended complete accepted representation or use a separately designed partial-update endpoint.

## Checkout fields

requestId must be a UUID and is normalized to lowercase. items must contain between one and fifty strict item objects. Each item has a valid productId and quantity from one through 999. A refinement rejects duplicate product IDs rather than summing them.

That duplicate policy simplifies the repository's lock and reservation loop. One product appears once in the accepted request. A browser can combine repeated additions in its cart UI, but the server still rejects duplicate item entries at the request boundary. A malformed client cannot rely on the repository to infer whether duplicates should be added, replaced or treated as conflicting instructions.

## Compute a total by hand

Use product P at 12.30 with quantity three and Q at 0.99 with quantity two. The line totals are 36.90 and 1.98, producing 38.88. The order records accepted unit-price snapshots, so a later catalog price change should not rewrite those existing line values through ordinary product editing.

The repository checks an order-total upper bound separately from individual price and quantity bounds. A collection of individually valid items can exceed the supported order total. This is a useful example of aggregate validation: field-level acceptance is necessary but not sufficient for accepting the whole operation.

Prepare a boundary fixture using many high-priced items and calculate the total independently. State whether rejection occurs before order creation and reservation in the inspected loop. A test should inspect durable state after the failure rather than treating the exception alone as proof of no partial effect.

## Quantity text in the browser

CartPanel stores quantity as text while editing and validates it with a decimal-integer pattern before submission. It converts accepted text to Number when constructing the attempt. This lets an input field temporarily hold incomplete text without pretending it is already a valid domain quantity.

The browser's estimate uses cached product prices. The checkout confirmation explicitly says current server prices determine the accepted total. A price change between display and checkout is therefore a product expectation to discuss, not automatically evidence that the decimal arithmetic failed. A quote-confirmation feature would introduce another identity and expiry policy.

## Invalid input must stop before writes

The service calls checkoutInput.parse before repo.checkout. A validation lab can execute this schema directly and verify normalized values and rejections. That is meaningful evidence for the boundary, but it does not execute SQL transactions or authenticated routing. Keep the result label narrow.

An integration fixture should additionally show that invalid input does not create an order, change product stock or append a successful checkout audit. Use one invalid field at a time initially so the rejection reason is clear. Combined-invalid cases can then document precedence if clients depend on it.

## Exercises

EC02-A: write a price acceptance table for the eight examples and explain normalization versus rounding.

EC02-B: design checkout fixtures for empty items, duplicate products, fractional quantity, fifty-one items and uppercase UUID text. State the expected parsed result or rejection.

EC02-C: calculate the P/Q total and propose an aggregate-limit test. Distinguish cached cart estimate, accepted line snapshot and future quote identity.

[Course index](README.md) · [Foundation answers](answers/01-checkout-foundations.md)
