# Frontend Modularization

## Active entry point

The production inbox now loads `src/js/app.js` as its single browser module entry point. The large inline module previously embedded in `index.html` has been moved into this file.

The HTML document remains responsible for page structure and styling. Runtime behavior is split across the existing modules:

| Responsibility | Module |
|---|---|
| App initialization and event wiring | `src/js/app.js` |
| Shared Supabase client | `src/js/services/supabase.js` |
| Supabase message queries and Realtime | `assets/js/messages.js` |
| Push subscription and sound | `assets/js/push-notifications.js` |
| Shared UI state | `src/js/state/app-state.js` |
| Conversation grouping and search | `src/js/state/conversation-state.js` |
| Message merge, upsert, and removal | `src/js/state/message-state.js` |
| Connection indicator | `src/js/components/header.js` |
| Conversation list and selection | `src/js/components/conversation-list.js` |
| Chat header and mobile chat state | `src/js/components/chat-window.js` |
| Message rendering | `src/js/components/message-list.js` |
| Composer event handling | `src/js/components/message-input.js` |

## Compatibility decisions

- Existing element IDs and page layout are retained.
- The existing Supabase client remains the single client instance used by the page.
- The existing `cloud-tools/messages/text` API contract is unchanged.
- Message columns and database schema are unchanged.
- Realtime subscription remains a single channel for `trx_messages`.
- Push registration and the sound preference remain browser-side behavior.
- The `/wa/` page is not changed by this refactor.

## State and event flow

The app entry point owns orchestration. State helper modules remain pure and do not create Supabase clients or attach DOM listeners. UI components render into existing DOM roots and expose explicit binding cleanup functions.

The entry point:
1. Initializes sound priming and UI controls.
2. Registers the Service Worker without prompting for notification permission.
3. Loads message history.
4. Starts one Realtime subscription.
5. Applies inbound inserts, updates, and deletes to shared state.
6. Delegates rendering to component modules.

## Automated tests

`tests/frontend-state.test.mjs` covers phone grouping, conversation ordering and search, message merge/upsert, and deletion. GitHub Actions runs these tests and checks JavaScript syntax on pull requests.

Browser-level validation remains required for:
- Responsive chat navigation.
- Browser audio autoplay behavior.
- Push permission and subscription lifecycle.
- Notifications while the PWA is closed.
- Notification click navigation.

No browser automation framework is introduced in this change; those scenarios remain explicit release-gate tests.
