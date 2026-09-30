# 10. Workspace lifetimes and user switches

[Course index](README.md) · [Worked review](answers/03-browser-commerce.md)

Sources: [App](../../frontend/src/App.tsx), [useWorkspace](../../frontend/src/hooks/useWorkspace.ts), and [API client](../../frontend/src/api/client.ts). The lifetime of local work is a product behavior. A user needs to know whether changing a tab, signing out, or refreshing the page preserves a cart and an uncertain checkout attempt.

## Hidden sections remain part of the workspace

The catalogue and orders sections are rendered with hidden attributes according to the selected tab. They are not conditionally removed merely because the user changes views. Cart and attempt state live in the parent application. This arrangement lets a user inspect order history while retaining an uncertain attempt or unfinished cart in the same session.

The difference between hidden and unmounted matters for effects, queries, and local state. A hidden component can remain mounted and retain its hooks. A future refactor to conditional rendering could change that behavior even if the screen looks identical in a screenshot. A regression test should therefore navigate away and back, then inspect retained work rather than only checking which section is visible.

The application combines busy flags from product, cart, and order work. Navigation buttons and sign-out are disabled while work is busy. Product and cart controls also receive cross-workspace busy information. This reduces overlapping interactions that could confuse acceptance and editor state. It is a local coordination mechanism, not a replacement for server concurrency controls across multiple tabs or users.

## Dirty state is broader than a form field

The parent considers product drafts, a nonempty cart, and an existing checkout attempt when deciding whether work is at risk. A cart may be meaningful even if no individual input is currently focused. An attempt may need preservation even if the shopper is no longer editing. The beforeunload warning uses that broader dirty concept to alert the user before a page refresh or close.

The workspace hook has its own dirty and busy handling for the component that uses it. It guards local operations with a synchronous ref as well as state, so two rapid calls cannot both begin before React has rendered a disabled button. This illustrates why visual disabling alone is not a complete reentrancy guard. The server still needs idempotency and version conditions because the browser guard has only local scope.

The alive ref is reset on mount and cleared on cleanup. Asynchronous handlers check it before updating local state after completion. That avoids selected updates after unmount. It does not cancel a server transaction, and the generic hook does not provide an AbortController for every mutation. Learners should separate component lifetime protection from transport cancellation and durable outcome control.

## Sign-out deliberately discards session work

If work is dirty, sign-out asks for confirmation with reminders to export and to review order history when checkout is uncertain. On acceptance, the application clears the query cache, session, cart, attempt, last order focus, guards, and selected authentication display state. This prevents the next account from inheriting the previous account's cart or cached observations through the normal sign-out path.

The session token is held in memory. Refreshing signs the user out, and the in-memory cart and attempt are lost. This is a simple local learning design with an explicit user-facing statement. It should not be described as persistent cart recovery. Adding persistence later would require account binding, schema versioning for stored drafts, expiry or cleanup behavior, and careful treatment of uncertain attempts.

Login clears the query client before adopting the new session. The normal UI only presents login while no session exists, so sign-out is the usual transition between accounts. Tests should exercise the actual sequence rather than directly mutating internal session state in a way the interface never supports, unless the test explicitly targets a lower-level invariant.

## Draft export is a recovery aid with limits

The export helper creates a JSON Blob, triggers a local download, and schedules revocation of the object URL. It does not upload the file or register it with the backend. A saved cart export can preserve requested items and an attempt key for manual investigation, but the application does not show a general import-and-resume flow in the inspected code.

A useful exercise asks learners to write a recovery instruction for someone who exported before signing out. The instruction should tell them to authenticate to the correct account and inspect current order history before starting a new purchase. It should not tell them to paste the exported object into an arbitrary endpoint without revalidation. Local files are editable, and current catalog or authority state may have changed.

## Test lifetimes through observable behavior

Begin with a cart and an uncertain attempt. Switch to orders and back; assert both remain. Attempt sign-out and cancel the confirmation; assert session and work remain. Then confirm sign-out and sign in as another user; assert the old cart, attempt, and cached order focus do not reappear. Finally, test a pending operation with a controlled promise and verify navigation is disabled until the operation settles.

These tests cover different lifetime transitions. A single snapshot of the initial page cannot establish any of them. Keep timer and promise control explicit so failures point to a real state transition rather than timing luck. Where browser beforeunload behavior differs in test environments, test handler registration and dirty-state decisions separately from a manual browser check of the native prompt.

### Exercises

**EC10 A.** Explain why replacing hidden sections with conditional rendering could alter recovery behavior. Design a test that protects the intended retained cart and attempt.

**EC10 B.** Trace sign-out cancellation and sign-out acceptance. List the state that survives the first path and is cleared on the second.

**EC10 C.** Compare the busy ref, disabled controls, alive ref, AbortController, and database transaction. State the boundary each one controls and one guarantee it does not provide.
