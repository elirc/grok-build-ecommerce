# 05. State transitions and demo payment

[Course index](README.md) · [Worked review](answers/02-order-lifecycle.md)

Sources: [order repository](../../backend/src/repositories/orderRepository.ts), [domain helpers](../../backend/src/lib/domain.ts), and [transition validation](../../backend/src/lib/validation.ts). This application teaches an order lifecycle. Its PAID transition is explicitly recorded as DEMO_PAYMENT; it is not evidence of a real payment processor charge.

## Treat the lifecycle as a directed graph

The supported path begins at PENDING. From there an order can move to PAID or CANCELLED. PAID can move to SHIPPED, and SHIPPED can move to DELIVERED. Delivered and cancelled orders are terminal in the current graph. Listing these edges is more precise than saying an administrator can change an order's status, because role authority alone does not make every status change valid.

The transition parser accepts a target status and expected version. It excludes PENDING as a requested target, while the repository checks whether the particular source-to-target edge is permitted. These are different validations. A syntactically valid request for DELIVERED can still be rejected when the current order is PENDING. A test suite should exercise both the payload contract and the lifecycle graph instead of assuming the enum alone enforces workflow.

Role rules add another dimension. Non-cancellation transitions require an administrator. Cancellation still uses order scope, so a customer can act only on their own visible order, and only when the graph permits cancellation. The repository first establishes scoped visibility, locks the order, and then reads it again before evaluating version and transition rules. That second read matters because state may have changed while the transaction waited for the lock.

## Version and status are complementary conditions

Imagine an administrator opens order version three while another administrator advances it to version four. The first editor's target may still look plausible, but its expected version no longer represents current accepted state. The repository rejects the stale request. A version condition protects the review boundary; a lifecycle edge protects the business process. Removing either weakens a different guarantee.

The final conditional order update includes identity, expected version, and the observed original status. It increments the version on acceptance. That is additional defensive evidence even after the explicit lock and checks. A review should not dismiss it as redundant without examining all transaction paths and isolation assumptions. Conditions written into the actual update make the acceptance rule visible at the write boundary.

For a transition matrix, use rows for source state and columns for target state. Mark permitted edges, role requirements, stock effects, and audit action. A matrix that merely marks valid or invalid misses useful distinctions. PENDING to CANCELLED restores inventory. PENDING to PAID records the demo payment action. PAID to SHIPPED and SHIPPED to DELIVERED do not reserve inventory again. A replay of checkout is a separate operation and should not be added as a lifecycle edge.

## Payment terminology needs evidence

The repository maps PAID to an audit action named DEMO_PAYMENT. This is a strong cue to keep training material honest. The state name supports a local demonstration of workflow, but it does not imply that funds were authorized, captured, settled, or refunded through an external provider. Those concepts would require provider requests, durable correlation, webhook verification, reconciliation, and failure handling beyond this code path.

When designing a future real-payment extension, begin by separating order acceptance from payment acceptance. A checkout transaction can reserve stock and create an order, but a network call to a provider cannot be made atomic with a local database transaction simply by placing both in one function. The course later uses this gap for a design exercise. For now, the correct description is a demo state transition with local audit evidence.

This wording also matters in tests and screenshots. A test named charges the customer would overstate what the implementation does. A name such as records the permitted demo payment transition is more accurate. Reviewers learn from test names as well as assertions, so names should express the actual boundary of evidence.

## Design a race without hiding the scheduler

Create two independent database connections in a disposable environment. Both actors load the same PENDING order and version. Pause both before requesting different transitions, then release them in a controlled sequence. One might request PAID while the other requests CANCELLED. The expected settled outcome is one accepted edge from the original version, with the other request rejected after observing changed state or version. Inventory restoration should occur only if cancellation is the accepted branch.

Do not use a single mocked repository instance that serially returns canned results and call it a concurrency test. That can verify controller handling but cannot reproduce row locks or transaction visibility. Record connection identity, barrier positions, accepted response, rejected response, final order version, final status, inventory, and audit rows. Those observations make the result reviewable even if the timing changes between machines.

### Exercises

**EC05 A.** Build the complete source-state and target-state matrix. For every permitted edge, record role requirements and whether inventory changes. Explain why a valid target enum is insufficient.

**EC05 B.** Trace competing PAID and CANCELLED requests from the same baseline. Give the expected postconditions for each possible winner, including stock and audit evidence.

**EC05 C.** Rewrite an inaccurate test description that says checkout charges a card. Then list the additional evidence a real payment integration would need before such a claim could be justified.
