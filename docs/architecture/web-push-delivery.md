# Web Push delivery architecture

## Components

1. `trx-webhook` stores inbound Meta messages in `trx_messages`.
2. The database trigger `enqueue_trx_message_push` inserts one `new_message` event into `trx_push_outbox` for each inbound message.
3. Supabase Cron calls `private.invoke_trx_push_dispatch()` once per minute.
4. The scheduler reads Vault secret `push_dispatch_secret`. If it is absent, the scheduled job exits without making an HTTP request.
5. `trx-push-dispatch` validates the same value against the Edge Function secret `PUSH_DISPATCH_SECRET`, checks VAPID configuration and active browser subscriptions, then claims and sends queued events.
6. The root Service Worker displays the notification and opens the inbox when clicked.

## Scheduler activation

The database job `trx-push-dispatch-every-minute` is registered and active.

Before it can call the dispatcher, add a Supabase Vault secret named:

```text
push_dispatch_secret
```

Its value must be exactly the existing Edge Function secret `PUSH_DISPATCH_SECRET`. Do not paste the value into GitHub or this document.

The dispatcher also requires the existing Edge Function secrets `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. The public-key endpoint `trx-push-config` returns `VAPID_PUBLIC_KEY` to the browser.

## Subscription flow

The inbox registers `sw.js` without requesting notification permission. The user explicitly enables notifications using the inbox button. The browser then:
- requests Notification permission,
- obtains `VAPID_PUBLIC_KEY` from `trx-push-config`,
- creates a Push API subscription,
- saves it through `trx-push-subscribe`.

The subscription endpoint is stored in `trx_push_subscriptions`. Disable removes the endpoint from active delivery and unsubscribes the browser.

## Outbox behavior

- No active subscriptions: the dispatcher does not claim any events; they remain pending.
- A permanently invalid endpoint (404/410) is disabled.
- Transient failures are retried with bounded exponential backoff when no endpoint succeeded.
- When at least one endpoint succeeds, the outbox event is marked sent to avoid duplicate notifications to successful endpoints. This means `sent` records at least one successful push submission, not confirmation that every device displayed the notification.
- Notifications contain the sender name/number and a message preview capped at 160 characters.

## Current activation warning

At the last audit, there were 15 pending `new_message` events and zero registered push subscriptions. Do not add `push_dispatch_secret` to Vault until deciding how to handle this historical backlog. Once a subscription exists and the secret is configured, those pending events will be eligible for delivery by default.

No historical outbox events have been modified or processed by this implementation.
