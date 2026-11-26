# Web Push delivery architecture

## Components

1. `trx-webhook` stores inbound Meta messages in `trx_messages`.
2. The database trigger `enqueue_trx_message_push` inserts one `new_message` event into `trx_push_outbox` for each inbound message.
3. Supabase Cron calls `private.invoke_trx_push_dispatch()` once per minute.
4. The scheduler calls `trx-push-dispatch` directly; it no longer reads a dispatcher secret from Vault or sends an `x-push-dispatch-secret` header.
5. `trx-push-dispatch` reads the VAPID keypair through the server-only RPC `get_trx_push_vapid_config()`, checks active browser subscriptions, then claims and sends queued events.
6. The root Service Worker displays the notification and opens the inbox when clicked.

## Dispatcher invocation

The database job `trx-push-dispatch-every-minute` is registered and active.

The dispatcher no longer requires `push_dispatch_secret` in Vault or `PUSH_DISPATCH_SECRET` in Edge Function Secrets. Its Edge Function endpoint is publicly callable (`verify_jwt=false` and no application-level dispatcher token); the database scheduler is the intended caller. A caller may invoke it, but the dispatcher only claims outbox events when at least one enabled subscription exists.

## VAPID key management

The VAPID keypair is stored encrypted in Supabase Vault as:
- `trx_vapid_public_key`
- `trx_vapid_private_key`

The SQL function `public.get_trx_push_vapid_config()` is executable only by `service_role`. It supplies the keypair to the server-side `trx-push-config` and `trx-push-dispatch` functions. The public config endpoint returns only the public key to the browser.

The private key is a JWK. The dispatcher verifies that its public/private keys match before claiming events. `VAPID_SUBJECT` is optional; when absent, the application URL is used.

## Subscription flow

The inbox registers `sw.js` without requesting notification permission. The user explicitly enables notifications using the inbox button. The browser then:
- requests Notification permission,
- obtains the VAPID public key from `trx-push-config`,
- creates a Push API subscription,
- saves it through `trx-push-subscribe`.

The subscription endpoint is stored in `trx_push_subscriptions`. Disable removes the endpoint from active delivery and unsubscribes the browser.

## Outbox behavior

- No active subscriptions: the dispatcher does not claim any events; they remain pending.
- A permanently invalid endpoint (404/410) is disabled.
- Transient failures are retried with bounded exponential backoff when no endpoint succeeded.
- When at least one endpoint succeeds, the outbox event is marked sent to avoid duplicate notifications to successful endpoints. This means `sent` records at least one successful push submission, not confirmation that every device displayed the notification.
- Notifications contain the sender name/number and a message preview capped at 160 characters.

## Current activation state

The original 15 pending `new_message` events are intentionally preserved. They have not been claimed, modified, or delivered by the activation tests.

The VAPID keypair has been provisioned in Vault and verified by both Edge Functions. `trx-push-config` returns HTTP 200 with the public key. A no-subscription dispatcher smoke test returns HTTP 200 with `waitingForSubscription: true`, confirming it does not claim pending events before a browser is registered.

The remaining activation step is a user-initiated browser subscription. Once at least one subscription is enabled, the next scheduled dispatcher run will process pending events, including the 15 historical events, as explicitly requested.


## Notification sound and vibration

- When the inbox page is open and focused, newly inserted inbound messages play a short two-tone Web Audio alert. This avoids playing both the in-app tone and the operating-system notification sound for the same visible message.
- The inbox header provides a per-browser ON/OFF preference for the in-app sound. The preference is stored in browser local storage. Enabling sound primes the Web Audio context from the user's click, as required by browser autoplay policies.
- When the PWA is closed or not focused, the Service Worker displays a system notification with `silent: false` and a vibration pattern where supported. The actual sound is the browser/operating-system notification sound and follows device notification settings.
- The standard Web Notifications API does not expose a cross-browser option to select a custom audio file or set notification volume. Volume is controlled by the device/browser notification settings.
- Vibration is best-effort and depends on browser, operating system, and device support.
