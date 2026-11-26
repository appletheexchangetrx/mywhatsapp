import { sendToMeta, MetaApiError } from "./meta-client.ts";
import { storeOutboundMessage } from "./message-store.ts";
import { buildGenericPayload, buildInteractivePayload, buildTextPayload, isObject, normalizeRecipient, RequestValidationError } from "./validation.ts";
import type { JsonObject, MetaMessagePayload } from "./types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function messagePreview(payload: MetaMessagePayload): string | null {
  if (payload.type === "text" && isObject(payload.text)) {
    return typeof payload.text.body === "string" ? payload.text.body : null;
  }
  if (payload.type === "interactive" && isObject(payload.interactive) && isObject(payload.interactive.body)) {
    return typeof payload.interactive.body.text === "string" ? payload.interactive.body.text : null;
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!isObject(body)) return json({ error: "Request body must be a JSON object." }, 400);

  let payload: MetaMessagePayload;
  try {
    const to = normalizeRecipient(body.to);
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (path.endsWith("/messages/text")) {
      payload = buildTextPayload(to, body);
    } else if (path.endsWith("/messages/interactive")) {
      payload = buildInteractivePayload(to, body.interactive);
    } else if (path.endsWith("/messages/catalog")) {
      const catalogInteractive: JsonObject = {
        type: "catalog_message",
        body: { text: body.body },
        action: {
          name: "catalog_message",
          ...(body.thumbnail_product_retailer_id
            ? { parameters: { thumbnail_product_retailer_id: body.thumbnail_product_retailer_id } }
            : {}),
        },
        ...(body.footer ? { footer: { text: body.footer } } : {}),
      };
      payload = buildInteractivePayload(to, catalogInteractive);
    } else {
      payload = buildGenericPayload(to, body);
    }
  } catch (error) {
    if (error instanceof RequestValidationError) return json({ error: error.message }, 400);
    return json({ error: "Invalid message request." }, 400);
  }

  try {
    const result = await sendToMeta(payload);
    try {
      await storeOutboundMessage(payload, result.wamid, result.response);
    } catch (error) {
      return json({
        error: error instanceof Error ? error.message : "Message was sent but could not be saved.",
        wamid: result.wamid,
        saved: false,
      }, 500);
    }

    return json({
      success: true,
      wamid: result.wamid,
      to: payload.to,
      type: payload.type,
      preview: messagePreview(payload),
      status: "accepted",
      saved: true,
    });
  } catch (error) {
    if (error instanceof MetaApiError) {
      return json({ error: error.message, details: error.details }, error.status >= 400 && error.status < 500 ? error.status : 502);
    }
    console.error("cloud-tools failed", String(error));
    return json({ error: error instanceof Error ? error.message : "Could not send WhatsApp message." }, 502);
  }
});
