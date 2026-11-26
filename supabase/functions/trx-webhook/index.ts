import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { recordStatusEvent } from "../cloud-tools/reliability-store.ts";

const headers = { "Content-Type": "application/json" };
function jsonResponse(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers }); }
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array<ArrayBuffer>(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function verifyMetaSignature(body: string, header: string | null, secret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const signature = hexToBytes(header.slice(7));
  if (!signature) return false;
  const encodedBytes = new TextEncoder().encode(body);
  const encodedBuffer = new ArrayBuffer(encodedBytes.byteLength);
  const encoded = new Uint8Array(encodedBuffer);
  encoded.set(encodedBytes);
  const keyBytes = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, encoded);
}
function extractTextBody(message: Record<string, unknown>): string | null {
  const type = String(message.type ?? "");
  const content = message[type];
  if (!content || typeof content !== "object") return null;
  const item = content as Record<string, unknown>;
  if (typeof item.body === "string") return item.body;
  if (typeof item.caption === "string") return item.caption;
  if (typeof item.text === "string") return item.text;
  if (type === "interactive") {
    const button = item.button_reply as Record<string, unknown> | undefined;
    const list = item.list_reply as Record<string, unknown> | undefined;
    if (typeof button?.title === "string") return button.title;
    if (typeof list?.title === "string") return list.title;
  }
  return null;
}
function getSupabaseSecretKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try { const keys = JSON.parse(raw); if (typeof keys.default === "string") return keys.default; }
    catch { console.error("SUPABASE_SECRET_KEYS is not valid JSON"); }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode"), token = url.searchParams.get("hub.verify_token"), challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (!verifyToken) return jsonResponse({ error: "Webhook verification is not configured" }, 500);
    if (mode === "subscribe" && token === verifyToken && challenge !== null) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return jsonResponse({ error: "Webhook verification failed" }, 403);
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return jsonResponse({ error: "Webhook signature validation is not configured" }, 500);
  const rawBody = await req.text();
  if (!await verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret)) return jsonResponse({ error: "Invalid webhook signature" }, 401);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch { return jsonResponse({ error: "Invalid JSON payload" }, 400); }
  if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return jsonResponse({ error: "Unsupported webhook payload" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL"), secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) return jsonResponse({ error: "Database connection is not configured" }, 500);
  const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let incomingMessages = 0, storedMessages = 0, statusUpdates = 0, updatedStatuses = 0, duplicateMessages = 0;

  for (const entry of payload.entry as Array<Record<string, unknown>>) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes as Array<Record<string, unknown>>) {
      if (change.field !== "messages" || !change.value || typeof change.value !== "object") continue;
      const value = change.value as Record<string, unknown>;
      const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata as Record<string, unknown> : {};
      const phoneNumberId = typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : null;
      const displayPhone = typeof metadata.display_phone_number === "string" ? metadata.display_phone_number : null;

      if (Array.isArray(value.statuses)) {
        for (const item of value.statuses as Array<Record<string, unknown>>) {
          if (typeof item.id !== "string" || typeof item.status !== "string") continue;
          const seconds = typeof item.timestamp === "string" ? Number(item.timestamp) : NaN;
          const eventTime = Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
          statusUpdates++;
          try {
            await recordStatusEvent(item.id, item.status, eventTime, Array.isArray(item.errors) && item.errors.length ? item.errors : null, item);
            updatedStatuses++;
          } catch (error) {
            console.error("Failed to persist WhatsApp message status", String(error));
            return jsonResponse({ error: "Failed to persist message status event" }, 500);
          }
        }
      }

      if (!Array.isArray(value.messages) || value.messages.length === 0) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts as Array<Record<string, unknown>> : [];
      const messages = value.messages as Array<Record<string, unknown>>;
      const rows = messages.map((message) => {
        const from = typeof message.from === "string" ? message.from : null, wamid = typeof message.id === "string" ? message.id : null;
        if (!from || !wamid) return null;
        const contact = contacts.find((item) => item.wa_id === from);
        const profile = contact?.profile && typeof contact.profile === "object" ? contact.profile as Record<string, unknown> : {};
        const timestamp = typeof message.timestamp === "string" ? Number(message.timestamp) : NaN;
        const interactive = message.type === "interactive" && message.interactive && typeof message.interactive === "object" ? message.interactive as Record<string, unknown> : null;
        const context = message.context && typeof message.context === "object" ? message.context as Record<string, unknown> : null;
        return {
          wamid, from_phone: from, profile_name: typeof profile.name === "string" ? profile.name : null,
          phone_number_id: phoneNumberId, display_phone_number: displayPhone,
          message_type: typeof message.type === "string" ? message.type : "unknown",
          interactive_type: typeof interactive?.type === "string" ? interactive.type : null,
          context_wamid: typeof context?.id === "string" ? context.id : null,
          from_user_id: typeof message.from_user_id === "string" ? message.from_user_id : null,
          text_body: extractTextBody(message),
          message_timestamp: Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null,
          raw_message: message, direction: "inbound",
        };
      }).filter((row): row is NonNullable<typeof row> => row !== null);
      incomingMessages += messages.length;
      if (rows.length) {
        const { data: insertedRows, error } = await supabase.from("trx_messages").upsert(rows, { onConflict: "wamid", ignoreDuplicates: true }).select("id");
        if (error) {
          console.error("Failed to store incoming WhatsApp messages", { code: error.code, message: error.message });
          return jsonResponse({ error: "Failed to store incoming messages" }, 500);
        }
        const count = insertedRows?.length ?? 0;
        storedMessages += count;
        duplicateMessages += rows.length - count;
      }
    }
  }
  console.info("WhatsApp webhook accepted", { entries: payload.entry.length, incomingMessages, storedMessages, duplicateMessages, statusUpdates, updatedStatuses });
  return jsonResponse({ received: true, incomingMessages, storedMessages, duplicateMessages, statusUpdates, updatedStatuses });
});
