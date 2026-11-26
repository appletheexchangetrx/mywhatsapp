# Web Push Delivery Diagnostics

**Baseline:** 2026-11-26, Supabase project `axednjikcambzbkxyqpp`  
**Scope:** dispatcher, subscription lifecycle, and outbox behavior  
**Execution mode:** source changes only; no production function was deployed and no outbox row was changed.

## Observed production state

At the time of inspection:

- 21 outbox rows were `pending`.
- Pending attempts were distributed across attempts 2, 3, and 4.
- One subscription was enabled and one was disabled.
- The older subscription had been disabled by the dispatcher after a permanent provider response.
- A newer subscription was registered shortly afterward.
- Subsequent dispatcher logs showed repeated `Web Push delivery failed` warnings with `statusCode: undefined` and `permanent: undefined`.

The previous dispatcher logged only those two properties. It did not log the thrown error name or message, so the exact cause of the newer subscription's failures could not be identified from the existing logs.

## Dispatcher behavior preserved

The dispatcher deliberately checks for an enabled subscription before claiming outbox rows.

If there is no enabled subscription, it returns `waitingForSubscription: true` without claiming pending events. This is important: pending events remain queued until a device is available.

The implementation continues to:

- Claim only eligible events through `claim_trx_push_outbox`.
- Disable subscriptions for permanent failures and HTTP 404/410.
- Retry transient failures with backoff.
- Mark an event sent only when at least one subscription accepts the push.
- Preserve pending rows when there is no enabled subscription.

No bulk status change, attempt reset, deletion, or manual replay was performed.

## Source improvement in this branch

The dispatcher now records a bounded, sanitized error description:

- HTTP status code, if supplied by the provider library.
- Permanent/transient classification.
- Error class name.
- A shortened error message with URL-like values redacted.
- Outbox event and subscription identifiers for correlation.

It also logs a summary of each dispatch run, including processed events, deliveries, failures, and enabled subscription count.

The response body remains free of provider error details. The diagnostic information is intended for function logs only.

## Verification procedure after deployment

1. Confirm the browser has a current Push API subscription.
2. Confirm the matching database subscription is enabled.
3. Confirm the browser subscription was created using the public VAPID key currently served by `trx-push-config`.
4. Trigger a controlled inbound test message.
5. Inspect the dispatcher log for the new sanitized error details or a successful dispatch summary.
6. Confirm the corresponding outbox row becomes `sent` only after a provider send succeeds.
7. Confirm the notification is displayed by the Service Worker.
8. Only after a successful new-event test, allow eligible historical pending events to drain naturally through the dispatcher.

## Outstanding operational dependency

The repository cannot renew a browser's push subscription on the user's behalf. The device must register a fresh subscription through the PWA's notification control when the old endpoint has expired or become invalid.

Do not force old events to `sent` and do not delete pending rows to clear the queue.
