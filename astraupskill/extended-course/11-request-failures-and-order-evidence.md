# 11. Request failures and order evidence

[Course index](README.md) · No worked review has been written for lessons 08-11 yet; compare your answers with the cited source and tests instead.

Sources: [request helper](../../frontend/src/api/client.ts), [workspace hook](../../frontend/src/hooks/useWorkspace.ts), [error handler](../../backend/src/lib/errors.ts), and [application middleware](../../backend/src/app.ts). A commerce interface must avoid turning an uncertain transport outcome into an incorrect statement about whether an order exists.

## Separate five failure locations

A request can fail before it reaches the server, during parsing or authorization, during the transaction, after commit while the response travels, or after the browser receives acceptance while refreshing other data. These locations can produce similar-looking error banners, but they have different durable implications. A recovery policy that treats all of them as safe to start again can create duplicate business intent.

The client helper aborts after fifteen seconds with a warning that the request may already have completed. The repository's checkout transaction options allow a different timeout window. The browser can therefore stop waiting while server work is still possible. Even if the durations matched, network delay and response loss would still separate the two clocks. A local abort is not a database cancellation protocol.

For checkout, the retained attempt key helps resolve that uncertainty. For an order transition, the expected version and current state provide a different recovery path. For a product update, current product data and the retained draft support reconciliation. The same generic request helper serves all these operations, but their domain recovery semantics differ.

## An HTTP response is evidence only after interpretation

The helper parses JSON before checking response.ok. Malformed content becomes an unreadable-response ApiError carrying the status. A successful status with invalid JSON is not a usable accepted order. Conversely, a non-success status with a valid structured body can give a useful error and request ID. The generic return type does not validate the shape of successful JSON at runtime.

The server attaches X-Request-Id early and includes requestId in error bodies. This lets a user-facing report correlate a failure without copying a bearer token or full request body. A recovery note should capture the operation, approximate time, account context, request key when relevant, and request ID if available. It should distinguish server-issued identifiers from locally generated attempt identifiers.

The error handler maps known application and database errors to bounded messages. Some Prisma conflicts share a generic refresh-oriented response. A 409 therefore does not by itself distinguish stale version, uniqueness collision, or a referenced-row restriction. The user needs the operation context and current state to choose the right next step.

## Transaction failure and response loss need different tests

To test rollback, inject a failure inside the transaction after an earlier write and inspect final database state. To test response loss, allow the transaction to commit and then prevent the browser from receiving a usable response. These are different experiments. A mock that rejects fetch before server execution only covers the first communication boundary and cannot establish either database behavior.

For a checkout response-loss test, retain the original key and items, submit a retry, and assert the same order identity and unchanged reservation count. For a transition response-loss test, load the current order and verify whether the intended status and version were accepted. Avoid silently converting an uncertain cancellation into another request with a newly substituted version, because that hides the review and lifecycle boundary from the user.

The in-memory checkout lab included in this course demonstrates sequential model outcomes. It explicitly reports that database and concurrency execution are false. Use it to practice predicting states, then compare its assumptions with the real repository. A passing model is useful learning evidence, but it is not an integration certificate.

## Messages should describe the next safe decision

A validation error should identify what to correct. An authentication error should preserve work while the user restores a valid session. A role denial should explain that the action was not permitted under current authority. A stale version should prompt comparison with current accepted values. An uncertain checkout should preserve the attempt and direct the user toward recovery with the same identity or order-history review.

After an accepted mutation followed by failed invalidation, the message should preserve the acceptance fact and describe the stale observation separately. The current generic workspace catch does not specialize every stage. That is a concrete improvement exercise: design message state with an accepted operation result and a separate refresh issue. Do not simply replace every error with success; a real refresh problem still deserves visibility.

## Create an incident handoff that another developer can use

Write a concise record containing expected behavior, observed behavior, operation identity, response category, durable-state observations, and what remains unknown. For example, an uncertain checkout handoff can say that the browser timed out, the same request key later returned order X, stock was reserved once, and no second key was submitted. That is much more useful than checkout broke.

Keep private data out of the handoff when it is not necessary. Product IDs and synthetic fixtures often suffice for reproduction. A real user's email or entire cart description may not be needed. The goal is a reproducible explanation of the boundary, not a dump of everything the browser knew.

### Exercises

**EC11 A.** Create five failure timelines, one for each location described above. For each, state whether durable acceptance is known, rejected, or uncertain.

**EC11 B.** Design separate rollback and response-loss experiments. Explain why a single rejected fetch mock cannot prove both.

**EC11 C.** Write a handoff note for a checkout that timed out and then replayed successfully. Include the identifiers needed for correlation while excluding credentials.
