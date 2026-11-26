import { createClient } from "npm:@supabase/supabase-js@2";
import type { JsonObject, MetaMessagePayload } from "./types.ts";

function getSupabaseSecretKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (typeof keys.default === "string") return keys.default;
    } catch {
      console.error("SUPABASE_SECRET_KEYS is not valid JSON");
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

function previewText(payload: MetaMessagePayload): string | null {
  if (payload.type === "text" && typeof payload.text === "object" && payload.text !== null) {
    const value = (payload.text as JsonObject).body;
    return typeof value === "string" ? value : null;
  }
  if (payload.type === "interactive" && typeof payload.interactive === "object" && payload.interactive !== null) {
    const interactive = payload.interactive as JsonObject;
    const body = interactive.body;
    if (typeof body === "object" && body !== null && typeof (body as JsonObject).text === "string") {
      return String((body as JsonObject).text);
    }
    return null;
  }
  for (const key of ["image", "video", "document"]) {
    const media = payload[key];
    if (typeof media === "object" && media !== null && typeof (media as JsonObject).caption === "string") {
      return String((media as JsonObject).caption);
    }
  }
  if (payload.type === "template" && typeof payload.template === "object" && payload.template !== null) {
    const name = (payload.template as JsonObject).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

export async function storeOutboundMessage(
  payload: MetaMessagePayload,
  wamid: string,
  metaResponse: JsonObject,
): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = getSupabaseSecretKey();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const displayPhone = Deno.env.get("WHATSAPP_DISPLAY_PHONE_NUMBER") ?? phoneNumberId;

  if (!url || !key || !phoneNumberId) {
    throw new Error("Database connection is not configured.");
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const row = {
    wamid,
    from_phone: displayPhone,
    profile_name: null,
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    recipient_phone: payload.to,
    direction: "outbound",
    status: "accepted",
    message_type: payload.type,
    text_body: previewText(payload),
    message_timestamp: now,
    raw_message: {
      direction: "outbound",
      request: payload,
      meta_response: metaResponse,
    },
  };

  const { error } = await db.from("trx_messages").upsert(row, {
    onConflict: "wamid",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("Message accepted by Meta but failed to save", {
      code: error.code,
      message: error.message,
      wamid,
    });
    throw new Error(`Message was accepted by WhatsApp but could not be saved. WAMID: ${wamid}`);
  }
}
