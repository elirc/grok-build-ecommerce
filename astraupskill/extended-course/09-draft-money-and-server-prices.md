# 09. Draft money and server prices

[Course index](README.md) · No worked review has been written for lessons 08-11 yet; compare your answers with the cited source and tests instead.

Sources: [frontend value helpers](../../frontend/src/api/client.ts), [cart](../../frontend/src/features/cart/CartPanel.tsx), [validation](../../backend/src/lib/validation.ts), and [accepted checkout arithmetic](../../backend/src/repositories/orderRepository.ts). This chapter develops a precise vocabulary for estimates, accepted prices, and stored historical values.

## A display estimate is useful without being authoritative

The cart holds Product snapshots, including price strings, because the catalogue response gives the browser enough information to display an estimate. The cents helper splits a price string and converts its whole and fractional portions to integer cents. Cart arithmetic uses these values with requested quantities. This avoids common decimal display surprises for the expected two-place product strings.

However, the helper is not a full validator for arbitrary user-entered prices. It assumes the application's product-price representation. A caller that passes an exponent, a negative malformed string, or more fractional digits may get behavior outside the intended contract. The product input schema is the place where accepted administrative price text is constrained. Distinguish a formatter for trusted application values from a parser for untrusted input.

The checkout payload sends product IDs and quantities. It does not submit an accepted total or unit price. The server locks and reads products, then computes the order using their current prices. The displayed estimate can therefore differ from the accepted total if catalogue prices changed since the browser loaded them. The first-checkout confirmation explicitly mentions current server prices, and the success notice reports the accepted total.

## Reconciliation needs line-level evidence

Suppose the browser estimates two lamps at 18.00 each and one notebook at 4.50, for 40.50. Before checkout, the lamp price changes to 19.25. The accepted order total becomes 43.00 if all other conditions are unchanged. The explanation should compare line quantities and accepted unit prices, not simply state that the total changed. OrderItem snapshots preserve the accepted product name, SKU, quantity, and price for that purpose.

A later catalogue edit does not retroactively change those stored order-line prices. The order DTO formats them to two places. This allows order history to remain intelligible even when a current product has a different name or price. A test should edit the catalogue after checkout and then read the order, asserting that historical line snapshots remain the accepted values.

The application uses USD examples and excludes tax and shipping in its stated local workflow. Do not silently add those amounts to a teaching calculation and imply the current total includes them. A tax or shipping extension would need separate inputs, calculation rules, accepted snapshots, and reconciliation behavior. Those can be useful design exercises when labeled as future work.

## Full replacement drafts can overwrite more than the visible edit

ProductDraft includes the editable product fields, with stock represented as a string for the input. The update schema expects a full product object with an expected version, rather than a patch containing only changed fields. This means an administrator editing a name is also submitting their draft's price, stock, active flag, and other values. The version condition is therefore crucial: it prevents that old full snapshot from silently replacing intervening accepted changes.

Imagine a checkout decrements stock and increments the product version while an administrator has an editor open. The administrator's save should conflict rather than restoring the old stock value from the draft. This is a direct connection between inventory operations and catalogue editing. A test focused only on two administrators changing names would miss this cross-feature race.

A future partial-update API would need to define which fields are allowed and how version review still works. Partial payloads reduce accidental replacement of unrelated fields, but they do not eliminate conflicts or authority checks. The current course teaches the full-replacement contract as inspected, rather than treating PATCH semantics as already implemented.

## Numeric boundaries deserve independent cases

The price grammar allows up to six whole-number digits and at most two fractional digits, then requires a positive value. Stock allows integer quantities from zero to one million. Checkout line quantities allow one through 999, and a cart contains one through fifty distinct product IDs. These limits belong to different concepts and should not be collapsed into one maximum-number rule.

For a boundary worksheet, include the smallest positive price, a whole-number price that normalizes to two places, the largest permitted price, a zero price, an overprecise price, and a number supplied where a string is required. Separately test stock zero, stock at the ceiling, stock above the ceiling, and fractional stock. Then test checkout quantities independently. This decomposition reveals whether a future change accidentally applies the wrong limit to the wrong field.

## Review the arithmetic path end to end

Trace one product from database Decimal through DTO string, browser estimate, checkout product reload, Decimal multiplication, stored order total, and order DTO string. At each boundary, write the representation and who is allowed to supply it. This exercise makes hidden conversions visible and shows why a browser number is not automatically the accepted monetary value.

A robust answer should also identify the total ceiling check. Even when every individual line is valid, the combined total must fit the supported order range. Test that constraint with several high-price, high-quantity lines rather than relying only on the largest single product. A mathematically correct sum can still be outside the application's supported domain.

### Exercises

**EC09 A.** Calculate the lamp-and-notebook estimate and accepted total after a price change. Identify the stored fields that explain the difference later.

**EC09 B.** Trace an administrator's full product draft racing a checkout stock decrement. Explain why product versioning protects inventory even when the administrator intended only a name change.

**EC09 C.** Build separate boundary tables for price strings, stock numbers, checkout quantities, and total value. Include representation errors as well as numeric range errors.
