# 07. Roles, ownership, and current authority

[Course index](README.md) · [Worked review](answers/02-order-lifecycle.md)

Read [authentication](../../backend/src/middleware/auth.ts), [domain scope helpers](../../backend/src/lib/domain.ts), [product repository](../../backend/src/repositories/productRepository.ts), and [order repository](../../backend/src/repositories/orderRepository.ts). Authority is assembled from verified identity and current server data, then narrowed for each operation.

## A token identifies a subject, not an immutable role snapshot

The authentication middleware verifies the bearer token with an explicit algorithm, issuer, and audience, then validates the subject's identity syntax. It loads the current active user from the database and attaches that current actor to the request. The repository therefore receives the current role from a server lookup rather than trusting a role string supplied in a request body.

This design has a useful consequence for a role change or account deactivation: subsequent authenticated requests consult current account data. It also creates a dependency on that lookup. A token that was cryptographically issued earlier is not sufficient if the account is no longer active. A test should separate invalid token cases from a valid token whose subject no longer resolves to an active user.

The token's thirty-minute lifetime is one part of session behavior, not a complete description of revocation or browser storage. The frontend holds a session object for interaction, while the backend re-evaluates current account state. If the browser still displays an administrator control after a server-side demotion, the server must nevertheless reject the restricted operation. Hidden buttons are a convenience, not the authority boundary.

## Scope differs by resource

For orders, orderScope returns a user filter for customers and an unrestricted ownership filter for administrators, after validating actor identity and role. The repository combines that scope with the requested order identity. A customer asking for another customer's order should therefore receive the scoped not-found behavior instead of borrowing authority from knowledge of the ID.

For products, customers see active catalog records. Administrators can manage broader catalog state. Listing inactive products is explicitly restricted for nonadministrators, rather than silently treating every arbitrary active filter as acceptable. Product creation, update, and deletion require administrator authority. Order creation is different: authenticated customers can checkout for their own actor identity without supplying another user ID.

Audit access also has resource-specific rules. Product history requires administrator authority. Order history first establishes visibility of the order under the actor's scope. These differences are deliberate surfaces to review. A generic statement that all audit endpoints behave the same would conceal important policy choices.

## Denial responses reveal policy choices

A missing or foreign order can produce the same scoped not-found response. That avoids confirming the existence of another customer's order through this route. A prohibited action on a visible object may produce a role denial or lifecycle conflict instead. Error precedence matters when several conditions are wrong at once. For example, a nonadministrator attempting a non-cancellation transition is rejected by the administrator requirement before a normal successful transition path can occur.

Build a table with actor role, ownership, account activity, operation, and expected broad response category. Use explicit examples: active customer viewing own order; active customer viewing another order; active administrator viewing either; inactive user presenting a previously issued token; customer trying to list inactive products. This table is more useful than a single test called authorization works.

Avoid asserting a particular denial timing or database query count unless the source and test support it. The important externally visible contract is that unauthorized data and effects are not returned or accepted. Internal ordering can still matter for side channels and efficiency, but those claims need targeted evidence rather than inference from a role enum.

## Typed actors are not self-authenticating

Repository methods accept an Actor-shaped value. TypeScript can help callers supply the expected fields during development, but any runtime caller can construct an object. The repository's scope helpers validate identity syntax and supported role values; they do not independently prove that an arbitrary Actor object came from JWT verification and a current-user lookup. That provenance is established by the application call path.

A layered test strategy should reflect this. Middleware tests establish token and current-user behavior. Service tests establish parsing and delegation. Repository tests establish scoped queries and conditional writes. End-to-end tests connect the layers for representative sensitive operations. A unit test that calls the repository with `{ role: 'ADMIN' }` has intentionally supplied authority as a fixture; it has not tested authentication.

## Practice a role-change incident

An administrator is demoted while a product editor remains open. The browser still has a cached product and administrator-looking session data. When the user saves, the next authenticated request should obtain the current customer role and the restricted product write should fail. The local draft should remain available. A clear UI can explain that access changed without claiming the draft was accepted.

The investigation should inspect token validity, current account activity and role, request path, and the returned error. Do not begin by modifying the token to contain a different role; the inspected implementation derives role from the user lookup. This exercise teaches learners to follow actual authority sources instead of assuming a familiar JWT design from another project.

### Exercises

**EC07 A.** Trace a valid token for a user who has just been deactivated. Identify which stage rejects the request and distinguish that from signature verification failure.

**EC07 B.** Construct a role-and-ownership matrix for order detail, order cancellation, product update, and inactive-product listing. Explain the policy represented by each denial.

**EC07 C.** Design a demotion-while-editing test that checks both server rejection and retained browser work. State which layer each assertion exercises.
