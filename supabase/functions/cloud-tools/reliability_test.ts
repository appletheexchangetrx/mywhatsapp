import { fingerprintPayload } from "./reliability-store.ts";
import { classifyMetaStatus, parseMetaResponse } from "./meta-client.ts";
import type { MetaMessagePayload } from "./types.ts";

function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

Deno.test("idempotency fingerprint is stable for the same canonical payload", async () => {
  const payload: MetaMessagePayload = { messaging_product: "whatsapp", recipient_type: "individual", to: "6281234567890", type: "text", text: { body: "hello", preview_url: false } };
  const first = await fingerprintPayload(payload);
  const second = await fingerprintPayload(payload);
  assert(first === second && first.length === 64, "Expected stable SHA-256 fingerprint.");
});

Deno.test("different payloads produce different idempotency fingerprints", async () => {
  const base: MetaMessagePayload = { messaging_product: "whatsapp", recipient_type: "individual", to: "6281234567890", type: "text", text: { body: "hello" } };
  const changed: MetaMessagePayload = { ...base, text: { body: "different" } };
  assert(await fingerprintPayload(base) !== await fingerprintPayload(changed), "Payload changes must be detected.");
});

Deno.test("Meta 429 is retryable only after explicit rejection", () => {
  assert(classifyMetaStatus(429) === "retryable", "429 must permit a controlled retry.");
});

Deno.test("Meta 408 and 5xx remain unknown to prevent duplicate sends", () => {
  assert(classifyMetaStatus(408) === "unknown", "408 outcome can be ambiguous.");
  assert(classifyMetaStatus(500) === "unknown" && classifyMetaStatus(503) === "unknown", "5xx outcome must remain unknown.");
});

Deno.test("definitive Meta 4xx rejection is terminal", () => {
  assert(classifyMetaStatus(400) === "failed" && classifyMetaStatus(401) === "failed", "Definitive 4xx rejection must be terminal.");
});

Deno.test("non-JSON Meta response preserves response body and HTTP status at caller", async () => {
  const parsed = await parseMetaResponse(new Response("upstream gateway error", { status: 502 }));
  assert(parsed.raw_body === "upstream gateway error", "Non-JSON body must be preserved for diagnosis.");
});
