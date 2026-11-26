import { supabase } from "./supabase.js";

const MESSAGE_COLUMNS = [
  "id",
  "wamid",
  "from_phone",
  "profile_name",
  "display_phone_number",
  "message_type",
  "text_body",
  "message_timestamp",
  "created_at",
  "direction",
  "status",
  "recipient_phone",
  "interactive_type",
  "context_wamid",
  "from_user_id",
].join(",");

export async function fetchMessages(limit = 50) {
  const { data, error } = await supabase
    .from("trx_messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export function subscribeToMessages({ onMessage, onStatus }) {
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
          onMessage?.({ eventType: "DELETE", record: payload.old });
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

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function sendWhatsAppMessage(to, message) {
  const { data, error } = await supabase.functions.invoke(
    "cloud-tools/messages/text",
    {
      body: { to, message },
    },
  );

  if (error) {
    let details = error.message;

    try {
      const response = error.context;
      if (response && typeof response.json === "function") {
        const body = await response.clone().json();
        details = body.error || body.message || details;
      }
    } catch {
      // Keep the SDK error message when the response is not JSON.
    }

    throw new Error(details);
  }

  if (data?.success !== true) {
    throw new Error(data?.error || "WhatsApp message could not be sent.");
  }

  return data;
}
