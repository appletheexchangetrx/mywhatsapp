import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { JsonObject, MetaMessagePayload } from "./types.ts";

export class IdempotencyConflictError extends Error {}

function getDatabase(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let key: string | undefined;
  if (raw) {
    try { key = JSON.parse(raw).default; } catch { console.error("SUPABASE_SECRET_KEYS is not valid JSON"); }
  }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Database connection is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fingerprintPayload(payload: MetaMessagePayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function beginSendRequest(
  idempotencyKey: string,
  payload: MetaMessagePayload,
): Promise<{ created: boolean; state: string; wamid: string | null; metaResponse: JsonObject | null }> {
  const db = getDatabase();
  const payloadHash = await fingerprintPayload(payload);
  const { error } = await db.from("trx_message_send_requests").insert({
    idempotency_key: idempotencyKey,
    payload_hash: payloadHash,
    payload,
    state: "sending",
  });
  if (!error) return { created: true, state: "sending", wamid: null, metaResponse: null };
  if (error.code !== "23505") throw new Error("Could not persist WhatsApp send request.");

  const { data, error: readError } = await db.from("trx_message_send_requests")
    .select("payload_hash,state,wamid,meta_response")
    .eq("idempotency_key", idempotencyKey).maybeSingle();
  if (readError || !data) throw new Error("Could not load existing WhatsApp send request.");
  if (data.payload_hash !== payloadHash) throw new IdempotencyConflictError("Idempotency-Key was already used with a different payload.");
  return {
    created: false,
    state: String(data.state),
    wamid: typeof data.wamid === "string" ? data.wamid : null,
    metaResponse: data.meta_response && typeof data.meta_response === "object" ? data.meta_response as JsonObject : null,
  };
}

export async function setSendRequestState(
  idempotencyKey: string,
  state: "failed" | "unknown" | "accepted_unstored",
  details: JsonObject,
  metaResponse?: JsonObject,
): Promise<void> {
  const update: Record<string, unknown> = { state, error_details: details, updated_at: new Date().toISOString() };
  if (state === "accepted_unstored") {
    if (typeof details.wamid === "string") update.wamid = details.wamid;
    if (metaResponse) update.meta_response = metaResponse;
  }
  const { error } = await getDatabase().from("trx_message_send_requests")
    .update(update)
    .eq("idempotency_key", idempotencyKey);
  if (error) throw new Error("Could not update WhatsApp send request state.");
}

export async function completeSendRequest(
  idempotencyKey: string,
  payload: MetaMessagePayload,
  wamid: string,
  metaResponse: JsonObject,
): Promise<void> {
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const displayPhone = Deno.env.get("WHATSAPP_DISPLAY_PHONE_NUMBER") ?? phoneNumberId;
  if (!phoneNumberId) throw new Error("WhatsApp phone number configuration is incomplete.");
  const preview = payload.type === "text" && payload.text && typeof payload.text === "object"
    ? (payload.text as JsonObject).body
    : payload.type === "interactive" && payload.interactive && typeof payload.interactive === "object"
    ? ((payload.interactive as JsonObject).body as JsonObject | undefined)?.text
    : null;
  const row = {
    from_phone: displayPhone,
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    recipient_phone: payload.to,
    message_type: payload.type,
    text_body: typeof preview === "string" ? preview : null,
    message_timestamp: new Date().toISOString(),
    raw_message: { direction: "outbound", request: payload, meta_response: metaResponse },
  };
  const { error } = await getDatabase().rpc("complete_trx_message_send_request", {
    p_idempotency_key: idempotencyKey,
    p_wamid: wamid,
    p_row: row,
    p_meta_response: metaResponse,
  });
  if (error) throw new Error("Message was accepted by WhatsApp but could not be saved.");
}

export async function recordStatusEvent(
  wamid: string,
  status: string,
  timestamp: string,
  errors: unknown,
  rawStatus: JsonObject,
): Promise<boolean> {
  const { data, error } = await getDatabase().rpc("record_trx_message_status_event", {
    p_wamid: wamid,
    p_status: status,
    p_status_timestamp: timestamp,
    p_error_details: errors ?? null,
    p_raw_status: rawStatus,
  });
  if (error) throw new Error("Failed to persist WhatsApp message status event.");
  return data === true;
}
