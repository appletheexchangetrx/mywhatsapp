import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function getSupabaseSecretKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (typeof keys.default === "string") return keys.default;
    } catch { console.error("SUPABASE_SECRET_KEYS is not valid JSON"); }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }

  const to = typeof body.to === "string" ? body.to.replace(/[+\s()-]/g, "") : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!/^\d{8,15}$/.test(to)) return json({ error: "Field 'to' must be a WhatsApp phone number in international format, digits only" }, 400);
  if (!message) return json({ error: "Field 'message' is required" }, 400);
  if (message.length > 4096) return json({ error: "Text message must not exceed 4096 characters" }, 400);

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const displayPhoneNumber = Deno.env.get("WHATSAPP_DISPLAY_PHONE_NUMBER") ?? phoneNumberId;
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");
  if (!accessToken || !phoneNumberId || !apiVersion) {
    console.error("Missing WhatsApp send configuration", {
      accessToken: !!accessToken, phoneNumberId: !!phoneNumberId, apiVersion: !!apiVersion,
    });
    return json({ error: "WhatsApp sending is not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_API_VERSION." }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = getSupabaseSecretKey();
  if (!supabaseUrl || !supabaseKey) return json({ error: "Database connection is not configured" }, 500);

  const graphUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  let metaResponse: Response;
  let metaData: Record<string, unknown>;
  try {
    metaResponse = await fetch(graphUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: message },
      }),
    });
    metaData = await metaResponse.json() as Record<string, unknown>;
  } catch (error) {
    console.error("WhatsApp Graph API request failed", String(error));
    return json({ error: "Could not reach WhatsApp Cloud API" }, 502);
  }

  if (!metaResponse.ok) {
    console.error("WhatsApp Graph API rejected message", { status: metaResponse.status, response: metaData });
    return json({ error: "WhatsApp rejected the message", details: metaData }, 502);
  }

  const messages = Array.isArray(metaData.messages) ? metaData.messages as Array<Record<string, unknown>> : [];
  const wamid = typeof messages[0]?.id === "string" ? messages[0].id : null;
  if (!wamid) return json({ error: "Meta accepted the request but did not return a message ID", meta: metaData }, 502);

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const row = {
    wamid,
    from_phone: displayPhoneNumber,
    profile_name: null,
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhoneNumber,
    recipient_phone: to,
    direction: "outbound",
    status: "accepted",
    message_type: "text",
    text_body: message,
    message_timestamp: now,
    raw_message: { direction: "outbound", request: { to, type: "text", text: { body: message } }, meta_response: metaData },
  };

  const { error } = await supabase.from("trx_messages").upsert(row, { onConflict: "wamid", ignoreDuplicates: false });
  if (error) {
    console.error("Message sent but failed to save in trx_messages", { code: error.code, message: error.message, wamid });
    return json({ error: "Message was accepted by WhatsApp but could not be saved to the database", wamid, saved: false }, 500);
  }

  return json({ success: true, wamid, to, message, status: "accepted", saved: true }, 200);
});