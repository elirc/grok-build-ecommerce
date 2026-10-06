# grokbuildecommerceproject: extended upskilling course

Source-grounded lessons, worked reviews, and a runnable lab. Status as of 2026-10-06: 11 lessons, worked reviews for lessons 1-7 only.

Read the lessons in order, write your own answers, then use the review guides. Source-reading findings are distinguished from proposed changes and unexecuted integration exercises.

## Lessons

- [1. Name five identities before following checkout](01-five-identities-at-checkout.md)
- [2. Derive the accepted checkout and price representations](02-validation-and-exact-prices.md)
- [3. Explain the lock before the receipt lookup](03-lock-order-and-durable-replay.md)
- [4. Reconcile reservation quantities with accepted orders](04-inventory-and-order-evidence.md)
- [5. State transitions and demo payment](05-state-transitions-and-demo-payment.md)
- [6. Cancellation and inventory restoration](06-cancellation-and-inventory-restoration.md)
- [7. Roles, ownership, and current authority](07-roles-ownership-and-current-authority.md)
- [8. Checkout attempts in the browser](08-checkout-attempts-in-the-browser.md)
- [9. Draft money and server prices](09-draft-money-and-server-prices.md)
- [10. Workspace lifetimes and user switches](10-workspace-lifetimes-and-user-switches.md)
- [11. Request failures and order evidence](11-request-failures-and-order-evidence.md)

## Worked reviews

- [01-checkout-foundations](answers/01-checkout-foundations.md) (lessons 1-4)
- [02-order-lifecycle](answers/02-order-lifecycle.md) (lessons 5-7)

## Runnable lab

- [Lab instructions and limitations](labs/README.md)

The lab is an explicit in-memory teaching model. No backend dependencies are installed by this course. Database concurrency and HTTP integration exercises require a configured disposable environment.
