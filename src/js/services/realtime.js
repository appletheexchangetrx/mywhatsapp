import { supabase } from "./supabase.js";

/**
 * Subscribe to all Postgres changes for trx_messages.
 * Returns an idempotent cleanup callback, preserving the legacy API.
 */
export function subscribeToMessages({ onMessage, onStatus } = {}) {
  const channel = supabase
    .channel("trx-messages-live")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "trx_messages",
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          onMessage?.({
            eventType: "DELETE",
            record: payload.old,
          });
          return;
        }

        onMessage?.({
          eventType: payload.eventType,
          record: payload.new,
        });
      },
    )
    .subscribe((status, error) => {
      onStatus?.(status, error);
    });

  let removed = false;

  return () => {
    if (removed) return;
    removed = true;
    void supabase.removeChannel(channel);
  };
}
