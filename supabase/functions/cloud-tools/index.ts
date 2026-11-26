import { sendToMeta, MetaApiError, classifyMetaStatus } from "./meta-client.ts";
import {
  beginSendRequest, completeSendRequest, setSendRequestState,
  IdempotencyConflictError,
} from "./reliability-store.ts";
import { buildGenericPayload, buildInteractivePayload, buildTextPayload, isObject, normalizeRecipient, RequestValidationError } from "./validation.ts";
import type { JsonObject, MetaMessagePayload } from "./types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: JsonObject, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, ...extraHeaders } });
}

function messagePreview(payload: MetaMessagePayload): string | null {
  if (payload.type === "text" && isObject(payload.text)) return typeof payload.text.body === "string" ? payload.text.body : null;
  if (payload.type === "interactive" && isObject(payload.interactive) && isObject(payload.interactive.body)) {
    return typeof payload.interactive.body.text === "string" ? payload.interactive.body.text : null;
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  if (!isObject(body)) return json({ error: "Request body must be a JSON object." }, 400);

  let payload: MetaMessagePayload;
  try {
    const to = normalizeRecipient(body.to);
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (path.endsWith("/messages/text")) payload = buildTextPayload(to, body);
    else if (path.endsWith("/messages/interactive")) payload = buildInteractivePayload(to, body.interactive);
    else if (path.endsWith("/messages/catalog")) {
      const interactive: JsonObject = {
        type: "catalog_message", body: { text: body.body },
        action: { name: "catalog_message", ...(body.thumbnail_product_retailer_id ? { parameters: { thumbnail_product_retailer_id: body.thumbnail_product_retailer_id } } : {}) },
        ...(body.footer ? { footer: { text: body.footer } } : {}),
      };
      payload = buildInteractivePayload(to, interactive);
    } else if (path.endsWith("/messages/product")) {
      payload = buildInteractivePayload(to, {
        type: "product", ...(body.body ? { body: { text: body.body } } : {}),
        ...(body.footer ? { footer: { text: body.footer } } : {}),
        action: { catalog_id: body.catalog_id, product_retailer_id: body.product_retailer_id },
      });
    } else if (path.endsWith("/messages/products")) {
      payload = buildInteractivePayload(to, {
        type: "product_list", header: { type: "text", text: body.header }, body: { text: body.body },
        ...(body.footer ? { footer: { text: body.footer } } : {}),
        action: { catalog_id: body.catalog_id, sections: body.sections },
      });
    } else if (path.endsWith("/messages/product-carousel")) {
      payload = buildInteractivePayload(to, { type: "carousel", body: { text: body.body }, action: { cards: body.cards } });
    } else payload = buildGenericPayload(to, body);
  } catch (error) {
    if (error instanceof RequestValidationError) return json({ error: error.message }, 400);
    return json({ error: "Invalid message request." }, 400);
  }

  const suppliedKey = req.headers.get("Idempotency-Key")?.trim();
  if (suppliedKey && (suppliedKey.length > 200 || /[\r\n]/.test(suppliedKey))) {
    return json({ error: "Idempotency-Key must be 1–200 characters." }, 400);
  }
  const idempotencyKey = suppliedKey || crypto.randomUUID();

  let request;
  try {
    request = await beginSendRequest(idempotencyKey, payload);
  } catch (error) {
    if (error instanceof IdempotencyConflictError) return json({ error: error.message }, 409);
    console.error("Could not persist send intent", String(error));
    return json({ error: "Could not persist WhatsApp send request." }, 503);
  }

  if (!request.created) {
    if (request.state === "accepted_unstored" && request.wamid && request.metaResponse) {
      try {
        await completeSendRequest(idempotencyKey, payload, request.wamid, request.metaResponse);
        return json({ success: true, wamid: request.wamid, to: payload.to, type: payload.type, preview: messagePreview(payload), status: "accepted", saved: true, idempotent_replay: true, reconciled: true });
      } catch (error) {
        console.error("Could not reconcile previously accepted WhatsApp message", String(error));
        return json({ error: "Message was accepted by WhatsApp; database persistence is still pending.", wamid: request.wamid, status: "accepted_unstored", saved: false, idempotent_replay: true }, 202);
      }
    }
    if (request.state === "retryable") {
      const retryAt = request.retryAfterAt ? new Date(request.retryAfterAt) : new Date(Date.now() + 60_000);
      return json({ error: "Meta rate limit has not expired. Retry with the same Idempotency-Key after Retry-After.", status: "retryable", retry_after_at: retryAt.toISOString() }, 429, { "Retry-After": retryAt.toUTCString() });
    }
    if (request.state === "accepted" && request.wamid) {
      return json({ success: true, wamid: request.wamid, to: payload.to, type: payload.type, preview: messagePreview(payload), status: "accepted", saved: true, idempotent_replay: true });
    }
    if (request.state === "failed") return json({ error: "This idempotent request previously failed.", status: "failed", idempotent_replay: true }, 409);
    return json({
      error: request.state === "unknown" ? "Previous send outcome is unknown; automatic retry was blocked." : "This request is already processing or requires persistence recovery.",
      status: request.state,
      wamid: request.wamid,
      saved: request.state === "accepted_unstored" ? false : undefined,
      idempotent_replay: true,
    }, 202);
  }

  try {
    const result = await sendToMeta(payload);
    try {
      await completeSendRequest(idempotencyKey, payload, result.wamid, result.response);
    } catch (error) {
      try { await setSendRequestState(idempotencyKey, "accepted_unstored", { message: String(error), wamid: result.wamid }, result.response); } catch (stateError) {
        console.error("Could not record accepted-but-unpersisted message", String(stateError));
      }
      return json({ error: "Message was accepted by WhatsApp but could not be saved.", wamid: result.wamid, saved: false, status: "accepted_unstored" }, 503);
    }
    return json({ success: true, wamid: result.wamid, to: payload.to, type: payload.type, preview: messagePreview(payload), status: "accepted", saved: true });
  } catch (error) {
    if (error instanceof MetaApiError) {
      const classification = classifyMetaStatus(error.status);
      if (classification === "failed") {
        try { await setSendRequestState(idempotencyKey, "failed", error.details); } catch (stateError) { console.error("Could not persist rejected send state", String(stateError)); }
        return json({ error: error.message, details: error.details, status: "failed" }, error.status);
      }
      if (classification === "retryable") {
        const retryAt = error.retryAfter
          ? (Number.isFinite(Number(error.retryAfter)) && String(Number(error.retryAfter)) === error.retryAfter.trim() ? Date.now() + Number(error.retryAfter) * 1000 : Date.parse(error.retryAfter))
          : Date.now() + 60_000;
        const retryAfterAt = new Date(Number.isFinite(retryAt) ? retryAt : Date.now() + 60_000).toISOString();
        try { await setSendRequestState(idempotencyKey, "retryable", { ...error.details, retry_after_at: retryAfterAt }); } catch (stateError) { console.error("Could not persist retryable send state", String(stateError)); }
        const retryHeaders: Record<string, string> = error.retryAfter ? { "Retry-After": error.retryAfter } : {};
        return json({ error: "Meta explicitly rejected this request due to rate limiting. Retry with the same Idempotency-Key after the indicated delay.", status: "retryable", retry_after: error.retryAfter }, 429, retryHeaders);
      }
    }
    try { await setSendRequestState(idempotencyKey, "unknown", { message: error instanceof Error ? error.message : String(error) }); } catch (stateError) {
      console.error("Could not persist unknown send state", String(stateError));
    }
    console.error("cloud-tools send outcome is unknown", String(error));
    return json({ error: "WhatsApp send outcome is unknown; automatic resend is blocked. Reconcile the result before retrying.", status: "unknown" }, 502);
  }
});
